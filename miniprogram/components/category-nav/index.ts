import { ProductCategory } from '../../models/product';

Component({
  properties: {
    list: {
      type: Array,
      value: [] as any[],
      observer(newVal) {
        this.updateFormattedList(newVal);
      }
    }
  },

  data: {
    formattedList: [] as any[]
  },

  lifetimes: {
    attached() {
      this.updateFormattedList(this.properties.list);
    }
  },

  methods: {
    updateFormattedList(list: any[]) {
      if (!Array.isArray(list)) return;
      const formatted = list.map(item => {
        const iconStr = typeof item.icon === 'string' ? item.icon.trim() : '';
        const isImageIcon = /^(https?:\/\/|cloud:\/\/|\/|data:image\/(?:png|jpeg|webp|svg\+xml)[;,])/i.test(iconStr);
        return {
          ...item,
          id: item.id || item._id,
          isImageIcon,
          iconDisplay: !isImageIcon && Array.from(iconStr).length <= 4 ? (iconStr || '👟') : '👟'
        };
      });
      this.setData({ formattedList: formatted });
    },

    onIconError(e: any) {
      const index = Number(e.currentTarget.dataset.index);
      if (Number.isInteger(index) && this.data.formattedList[index]) {
        this.setData({ [`formattedList[${index}].isImageIcon`]: false, [`formattedList[${index}].iconDisplay`]: '👟' });
      }
    },

    onSelect(e: any) {
      const item = e.currentTarget.dataset.item;
      this.triggerEvent('select', { item });
      // 默认直接跳转商品列表页并带上分类ID
      wx.navigateTo({
        url: `/pages/goods/list/index?categoryId=${item.id}&categoryName=${encodeURIComponent(item.name)}`
      });
    }
  }
});
