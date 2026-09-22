import { formatPrice } from '../../utils/format';

Component({
  properties: {
    price: {
      type: null,
      value: 0,
      observer: 'updatePrice'
    },
    originalPrice: {
      type: null,
      value: 0,
      observer: 'updateOriginalPrice'
    },
    size: {
      type: String,
      value: 'md' // sm, md, lg, xl
    },
    color: {
      type: String,
      value: ''
    },
    accent: {
      type: Boolean,
      value: false
    }
  },

  data: {
    formatted: { currency: '¥', integer: '0', decimal: '' },
    origFormatted: ''
  },

  lifetimes: {
    attached() {
      this.updatePrice();
      this.updateOriginalPrice();
    }
  },

  methods: {
    updatePrice() {
      const formatted = formatPrice(this.properties.price, true);
      this.setData({ formatted });
    },
    updateOriginalPrice() {
      const orig = Number(this.properties.originalPrice);
      if (orig > 0) {
        const yuan = (orig / 100).toFixed(orig % 100 === 0 ? 0 : 2);
        this.setData({
          origFormatted: `¥${yuan}`
        });
      } else {
        this.setData({ origFormatted: '' });
      }
    }
  }
});
