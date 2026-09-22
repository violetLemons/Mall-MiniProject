// Local development/test adapter, not a production database. Transactions serialize
// and publish an isolated snapshot only after every operation has succeeded.
const fs = require('fs'), crypto = require('crypto');
const clone = value => structuredClone(value);
function createDb(initial = {}, filename = null) {
  let state = clone(initial), queue = Promise.resolve(), failure = null;
  const command = Object.fromEntries(['inc', 'gte', 'lte', 'neq', 'in'].map(op => [op, value => ({ $op: op, value })]));
  const at = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  function matches(doc, query) {
    return Object.entries(query).every(([k, v]) => {
      const a = at(doc, k);
      if (v instanceof RegExp) return v.test(String(a || ''));
      if (v?.$op) return ({ gte: () => a >= v.value, lte: () => a <= v.value, neq: () => a !== v.value, in: () => v.value.includes(a) })[v.$op]();
      return a === v || (v === null && a == null);
    });
  }
  function change(row, data) {
    for (const [k, v] of Object.entries(data)) {
      let dest = row; const bits = k.split('.');
      for (const bit of bits.slice(0, -1)) dest = dest[bit] ||= {};
      const last = bits.at(-1); dest[last] = v?.$op === 'inc' ? (dest[last] || 0) + v.value : clone(v);
    }
  }
  function persist(next) {
    if (filename) { fs.writeFileSync(filename + '.tmp', JSON.stringify(next)); fs.renameSync(filename + '.tmp', filename); }
    state = next;
  }
  async function atomic(fn) {
    const work = queue.then(async () => {
      const snapshot = clone(state); const tx = interfaceFor(() => snapshot, true);
      const result = await fn(tx); persist(snapshot); return result;
    });
    queue = work.catch(() => {}); return work;
  }
  function interfaceFor(source, inTx = false) {
    function collection(name) {
      let query = {}, offset = 0, limit = 100, fields = null, sort = [];
      const rows = () => source()[name] || [];
      function write(fn) {
        if (!inTx) return atomic(tx => fn(tx._state));
        if (failure && failure(name)) throw new Error('INJECTED_DATABASE_FAILURE');
        return Promise.resolve(fn(source()));
      }
      const chain = {
        where(q) { query = q; return chain; }, skip(n) { offset = n; return chain; }, limit(n) { limit = n; return chain; },
        orderBy(k, dir) { sort.push([k, dir]); return chain; }, field(f) { fields = f; return chain; },
        async get() {
          let found = rows().filter(r => matches(r, query));
          for (const [k, dir] of sort.slice().reverse()) found.sort((a, b) => (at(a, k) > at(b, k) ? 1 : at(a, k) < at(b, k) ? -1 : 0) * (dir === 'desc' ? -1 : 1));
          found = found.slice(offset, offset + limit);
          return { data: clone(fields ? found.map(r => Object.fromEntries(Object.keys(r).filter(k => k === '_id' || fields[k]).map(k => [k, r[k]]))) : found) };
        },
        async count() { return { total: rows().filter(r => matches(r, query)).length }; },
        doc(id) {
          if (typeof id !== 'string' || !id) throw new Error('INVALID_DOC_ID');
          return {
            async get() { return { data: clone(rows().find(r => r._id === id) || null) }; },
            set({ data }) { return write(s => { const arr = s[name] ||= [], idx = arr.findIndex(r => r._id === id), value = { ...clone(data), _id: id }; if (idx < 0) arr.push(value); else arr[idx] = value; return { _id: id }; }); },
            update({ data }) { return write(s => { const row = (s[name] || []).find(r => r._id === id); if (!row) throw new Error('DOCUMENT_NOT_FOUND'); change(row, data); return { stats: { updated: 1 } }; }); },
            remove() { return write(s => { const old = s[name] || []; s[name] = old.filter(r => r._id !== id); return { stats: { removed: old.length - s[name].length } }; }); }
          };
        },
        add({ data }) { const id = data._id || crypto.randomUUID(); return write(s => { const arr = s[name] ||= []; if (arr.some(r => r._id === id)) throw new Error('DUPLICATE_KEY'); arr.push({ ...clone(data), _id: id }); return { _id: id }; }); },
        update({ data }) { return write(s => { const found = (s[name] || []).filter(r => matches(r, query)); found.forEach(r => change(r, data)); return { stats: { updated: found.length } }; }); },
        remove() { return write(s => { const old = s[name] || []; s[name] = old.filter(r => !matches(r, query)); return { stats: { removed: old.length - s[name].length } }; }); }
      };
      return chain;
    }
    return { collection, command, serverDate: () => new Date(), RegExp: ({ regexp, options }) => new RegExp(regexp, options),
      runTransaction: fn => atomic(fn), get _state() { return source(); } };
  }
  const db = interfaceFor(() => state);
  db.snapshot = () => clone(state);
  db.injectFailure = callback => { failure = callback; };
  return db;
}
module.exports = { createDb };
