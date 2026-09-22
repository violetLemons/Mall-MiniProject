import { ProductItem } from '../../models/product';

Component({
  properties: {
    list: {
      type: Array,
      value: [] as ProductItem[]
    }
  },

  methods: {
    onTapProduct(e: any) {
      this.triggerEvent('click', e.detail);
    }
  }
});
