import { ProductItem } from '../../models/product';
import { formatSales } from '../../utils/format';

Component({
  properties: {
    product: {
      type: Object,
      value: {} as ProductItem,
      observer: 'onProductChange'
    }
  },

  data: {
    formattedSales: ''
  },

  lifetimes: {
    attached() {
      this.onProductChange();
    }
  },

  methods: {
    onProductChange() {
      const p = this.properties.product as ProductItem;
      if (p && p.sales !== undefined) {
        this.setData({
          formattedSales: formatSales(p.sales)
        });
      }
    },
    onTapCard() {
      const p = this.properties.product as ProductItem;
      if (p && p.id) {
        wx.navigateTo({
          url: `/pages/goods/detail/index?id=${p.id}`
        });
      }
    }
  }
});
