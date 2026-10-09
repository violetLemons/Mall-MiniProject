import { StoreService, PublicStore } from '../../services/store.service';
import { openPrivacy } from '../../services/compliance';
Page({
  data:{store:null as PublicStore|null,error:'',loading:false},
  onLoad(){this.load();},
  async load(){this.setData({loading:true,error:''});try{this.setData({store:await StoreService.get()});}catch(e:any){this.setData({error:e.message||'商家资料加载失败'});}finally{this.setData({loading:false});}},
  onPrivacy(){openPrivacy();},
  onCall(){const phone=this.data.store?.customerServicePhone;if(phone)wx.makePhoneCall({phoneNumber:phone});},
  onPreview(){const url=this.data.store?.businessLicenseUrl;if(url)wx.previewImage({urls:[url],current:url});}
});
