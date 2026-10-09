import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { requestCloud } from '../api/client';
import { useToast } from '../components/Toast';
import './StoreSettings.css';

type Rule = {province:string;city:string;district:string;deliverable:boolean;firstFee:number;additionalFee:number};
type Settings = {mallName:string;companyName:string;creditCode:string;businessLicenseUrl:string;filingNumber:string;customerServicePhone:string;serviceHours:string;privacyContact:string;shippingRules:Rule[];revision:string;shipWithinHours:number};
const fields:[keyof Settings,string][]=[['mallName','商城名称'],['companyName','公司名称'],['creditCode','统一社会信用代码'],['businessLicenseUrl','营业执照图片地址'],['filingNumber','小程序备案号'],['customerServicePhone','客服电话'],['serviceHours','客服服务时间'],['privacyContact','隐私联系渠道']];
export const StoreSettings:React.FC=()=>{
  const {toast}=useToast(),[settings,setSettings]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{setBusy(true);setError('');try{setSettings(await requestCloud<Settings>('adminProducts','getStoreSettings'));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{load();},[]);
  const save=async()=>{if(!settings||busy)return;setBusy(true);try{setSettings(await requestCloud<Settings>('adminProducts','saveStoreSettings',{...settings,expectedRevision:settings.revision}));toast('配置已保存','success');}catch(e:any){toast(e.message,'error');}finally{setBusy(false);}};
  const update=(index:number,patch:Partial<Rule>)=>setSettings(s=>s?{...s,shippingRules:s.shippingRules.map((r,i)=>i===index?{...r,...patch}:r)}:s);
  return <main className="store-settings">
    <header><h1>商家与配送</h1><div><button title="刷新配置" aria-label="刷新配置" disabled={busy} onClick={load}><RefreshCw size={18}/></button><button disabled={busy||!settings} onClick={save}><Save size={18}/>保存</button></div></header>
    {error&&<p role="alert">{error}</p>}
    {!settings?<p>{busy?'加载中...':'配置暂不可用'}</p>:<>
      <section><h2>经营主体</h2><div className="settings-fields">{fields.map(([key,label])=><label key={key}>{label}<input disabled={busy} value={String(settings[key]||'')} onChange={e=>setSettings({...settings,[key]:e.target.value})}/></label>)}</div></section>
      <section><div className="section-heading"><h2>配送与运费</h2><span>付款后48小时内发货</span><button title="添加区域" disabled={busy||settings.shippingRules.length>=100} onClick={()=>setSettings({...settings,shippingRules:[...settings.shippingRules,{province:'',city:'',district:'',deliverable:true,firstFee:0,additionalFee:0}]})}><Plus size={18}/>添加区域</button></div>
        <div className="shipping-rules"><table><thead><tr>{['省份','城市','区县','允许配送','首件运费（元）','续件运费（元）',''].map((x,i)=><th key={i}>{x}</th>)}</tr></thead>
          <tbody>{settings.shippingRules.map((r,i)=><tr key={i}>
            {(['province','city','district'] as const).map(k=><td key={k}><input aria-label={k+' '+(i+1)} disabled={busy} value={r[k]} placeholder={k==='province'?'留空匹配全部': '留空匹配上级区域'} onChange={e=>update(i,{[k]:e.target.value})}/></td>)}
            <td><input type="checkbox" aria-label={'允许配送 '+(i+1)} disabled={busy} checked={r.deliverable} onChange={e=>update(i,{deliverable:e.target.checked})}/></td>
            {(['firstFee','additionalFee'] as const).map(k=><td key={k}><input aria-label={k+' '+(i+1)} disabled={busy||!r.deliverable} type="number" min="0" max="1000000" step="0.01" value={r[k]/100} onChange={e=>update(i,{[k]:Math.round(Number(e.target.value)*100)})}/></td>)}
            <td><button title="删除区域" aria-label={'删除区域 '+(i+1)} disabled={busy} onClick={()=>setSettings({...settings,shippingRules:settings.shippingRules.filter((_,n)=>n!==i)})}><Trash2 size={16}/></button></td>
          </tr>)}</tbody></table></div>
        {!settings.shippingRules.length&&<p>尚未配置可配送区域</p>}
      </section>
    </>}
  </main>;
};
