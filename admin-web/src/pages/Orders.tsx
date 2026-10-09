import React, { useEffect, useRef, useState } from 'react';
import { requestCloud, AdminApi } from '../api/client';
import { Order } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatCents } from '../utils/format';
import { exportOrdersExcel } from '../utils/excel';

export const Orders: React.FC = () => {
  const { toast } = useToast();
  const [orders,setOrders]=useState<Order[]>([]), [status,setStatus]=useState('ALL'), [keyword,setKeyword]=useState('');
  const [page,setPage]=useState(1), [loading,setLoading]=useState(false), [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Order|null>(null), [trackingNo,setTrackingNo]=useState(''), [company,setCompany]=useState('SF');
  const [reason,setReason]=useState(''), [returnReceived,setReturnReceived]=useState(false);
  const [waiveReturn,setWaiveReturn]=useState(false),[waiverReason,setWaiverReason]=useState(''),[refundRecord,setRefundRecord]=useState<any>(null);
  const requestVersion=useRef(0),detailVersion=useRef(0);
  const load=async(targetPage=page)=>{const version=++requestVersion.current;setLoading(true);try{const rows=await AdminApi.getOrders({status,keyword,page:targetPage,pageSize:50});if(version===requestVersion.current)setOrders(rows);}catch(e:any){if(version===requestVersion.current)toast(e.message,'error');}finally{if(version===requestVersion.current)setLoading(false);}};
  useEffect(()=>{load();},[status,page]);
  const run=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{const result:any=await fn();if(result?.requiresAction){toast('退款异常：'+result.wechatStatus+'，需人工核实','error');}else{toast('操作已提交，请以服务端状态为准','success');}setSelected(null);await load();}catch(e:any){toast(e.message,'error');}finally{setBusy(false);}};
  const open=async(order:Order)=>{const version=++detailVersion.current;setSelected(order);setTrackingNo(order.trackingNo||'');setReason('');setReturnReceived(false);setWaiveReturn(false);setWaiverReason('');setRefundRecord(null);try{const detail:any=await requestCloud('adminOrders','get',{orderId:order.id});if(version===detailVersion.current)setRefundRecord(detail.refundRecord);}catch(e:any){toast(e.message,'error');}};
  return <div style={{padding:24}}>
    <h1>订单管理</h1>
    <div style={{display:'flex',gap:12,marginBottom:20}}>
      <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>
        {['ALL','PENDING_PAYMENT','CLOSING','PAID','SHIPPED','COMPLETED','REFUND_PENDING','REFUNDING','REFUNDED','CANCELLED'].map(s=><option key={s}>{s}</option>)}
      </select>
      <input placeholder="订单号" value={keyword} onChange={e=>setKeyword(e.target.value)}/>
      <button onClick={()=>{setPage(1);load(1);}} disabled={loading}>查询</button>
      <button onClick={()=>exportOrdersExcel(orders)}>导出当前页</button>
    </div>
    {loading?<p>加载中…</p>:<table style={{width:'100%',background:'#fff',borderCollapse:'collapse'}}>
      <thead><tr>{['订单','收货人','总额 / 现金 / 额度','状态','微信发货同步','操作'].map(t=><th key={t} style={{padding:12,textAlign:'left'}}>{t}</th>)}</tr></thead>
      <tbody>{orders.map(o=><tr key={o.id} style={{borderTop:'1px solid #eee'}}>
        <td style={{padding:12}}>{o.orderNo}{o.isTest&&<small>（测试）</small>}<br/>{o.createdAt}</td>
        <td>{o.customerName}<br/>{o.customerPhone}</td>
        <td>{formatCents(o.totalAmount)} / {formatCents(o.payAmount)} / {formatCents(o.balanceAmount||0)}</td>
        <td><Badge status={o.status}/>{o.status==='PAID' && (o as any).shipDeadlineAt && new Date((o as any).shipDeadlineAt).getTime()<Date.now()&&<small style={{display:'block',color:'#b91c1c'}}>发货已超48小时</small>}</td><td>{o.wxShippingSync?.status||'待履约'}<br/>{o.wxShippingSync?.message}</td>
        <td><button onClick={()=>open(o)}>详情与处理</button></td>
      </tr>)}</tbody>
    </table>}
    <div style={{display:'flex',gap:12,marginTop:16}}><button disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页</span><button disabled={orders.length<50} onClick={()=>setPage(page+1)}>下一页</button></div>
    <Modal isOpen={!!selected} onClose={()=>{if(!busy){detailVersion.current++;setSelected(null);}}} title="订单详情与处理" width="760px">
      {selected&&<div>
        <p>{selected.orderNo} · <Badge status={selected.status}/></p>
        <p>地址：{selected.shippingAddress?.province}{selected.shippingAddress?.city}{selected.shippingAddress?.district}{selected.shippingAddress?.detail}</p>
        {selected.items.map((i,index)=><p key={index}>{i.productName} · {i.colorName} ×{i.count}，{formatCents(i.totalAmount)}</p>)}
        {(selected as any).paymentOrderNo&&<p>付款批次：{(selected as any).paymentOrderNo}</p>}
        {refundRecord&&<p>售后原因：{refundRecord.reason}；微信退款：{refundRecord.wechatStatus||'待提交'} {refundRecord.requiresAction?'（需人工核实）':''}；最近错误：{refundRecord.lastError||'无'}{refundRecord.returnWaiver&&'；免退货依据：'+refundRecord.returnWaiver.reason}</p>}
        <p>现金：{formatCents(selected.payAmount)}；购物额度：{formatCents(selected.balanceAmount||0)}</p>
        <p>物流：{selected.logisticsCompany} {selected.trackingNo}；微信同步：{selected.wxShippingSync?.status||'待履约'}</p>
        {selected.status==='PAID'&&<div><select value={company} onChange={e=>setCompany(e.target.value)}>{['SF','ZTO','YTO','YD','STO','JD','JTSD','EMS','DBL'].map(v=><option key={v}>{v}</option>)}</select><input placeholder="真实物流单号" value={trackingNo} onChange={e=>setTrackingNo(e.target.value)}/><button disabled={busy||!trackingNo} onClick={()=>run(()=>AdminApi.shipOrder(selected.id,trackingNo,company))}>确认发货并上报微信</button></div>}
        {['SHIPPED','COMPLETED'].includes(selected.status)&&<div><button disabled={busy} onClick={()=>run(()=>AdminApi.syncWithWechat(selected.id))}>查询微信并核实收货</button><button disabled={busy} onClick={()=>run(()=>AdminApi.retryShippingSync(selected.id))}>核对后重试发货上报</button></div>}
        {selected.status==='REFUND_PENDING'&&<div>
          <p>此商品订单退款：现金原路退回，购物额度退回原账户。已发货或已收货可确认退货，或审核批准免退货。</p>
          <label><input type="checkbox" checked={returnReceived} onChange={e=>setReturnReceived(e.target.checked)}/>已人工确认收到退货</label><br/>
          <label><input type="checkbox" checked={waiveReturn} onChange={e=>setWaiveReturn(e.target.checked)}/>批准免退货退款</label><br/>
          {waiveReturn&&<textarea value={waiverReason} placeholder="免退货审核依据（至少5字）" onChange={e=>setWaiverReason(e.target.value)}/>}
          <input value={reason} placeholder="拒绝原因" onChange={e=>setReason(e.target.value)}/>
          <button disabled={busy} onClick={()=>run(()=>AdminApi.reviewRefund(selected.id,'APPROVE','',returnReceived,waiveReturn,waiverReason))}>批准并发起退款</button>
          <button disabled={busy||!reason.trim()} onClick={()=>run(()=>AdminApi.reviewRefund(selected.id,'REJECT',reason))}>拒绝申请</button>
        </div>}
        {selected.status==='REFUNDING'&&<div><p>现金成功回调或官方查单成功后，才会退回额度并完成退款。</p><button disabled={busy} onClick={()=>run(()=>AdminApi.queryRefund(selected.id))}>查退款结果</button><button disabled={busy} onClick={()=>run(()=>AdminApi.executeRefund(selected.id))}>查单后重试</button></div>}
      </div>}
    </Modal>
  </div>;
};
