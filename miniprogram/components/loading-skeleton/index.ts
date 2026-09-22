Component({
  properties: {
    type: {
      type: String,
      value: 'grid' // 'grid' | 'card' | 'banner' | 'detail'
    },
    count: {
      type: Number,
      value: 4
    }
  },

  data: {
    items: [] as number[]
  },

  lifetimes: {
    attached() {
      const count = this.properties.count || 4;
      const items = Array.from({ length: count }, (_, i) => i);
      this.setData({ items });
    }
  }
});
