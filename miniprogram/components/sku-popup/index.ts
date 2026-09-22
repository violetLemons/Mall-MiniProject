import { ProductItem, ShoeColor, ShoeSize } from '../../models/product';

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: 'onVisibleChange'
    },
    product: {
      type: Object,
      value: {} as ProductItem,
      observer: 'initSkuState'
    },
    actionType: {
      type: String,
      value: 'both' // 'both' | 'cart' | 'buy'
    }
  },

  data: {
    selectedColor: null as ShoeColor | null,
    selectedSize: null as ShoeSize | null,
    dynamicSizes: [] as ShoeSize[],
    quantity: 1,
    selectedText: '请选择颜色及规格'
  },

  methods: {
    computeSizesForColor(color: ShoeColor, skus: any[], baseSizes: ShoeSize[]): ShoeSize[] {
      if (!skus || skus.length === 0) return baseSizes || [];
      return (baseSizes || []).map(bs => {
        const matchingSku = skus.find(s =>
          (s.colorName === color.name || s.colorId === color.id) &&
          Number(s.size) === Number(bs.size)
        );
        if (matchingSku) {
          const stock = Number(matchingSku.stock) || 0;
          return {
            size: bs.size,
            inStock: stock > 0,
            stockCount: stock,
            skuId: matchingSku.skuId || matchingSku.id || matchingSku._id
          } as any;
        }
        return {
          size: bs.size,
          inStock: false,
          stockCount: 0
        };
      });
    },

    onVisibleChange(val: boolean) {
      if (val && !this.data.selectedColor) {
        this.initSkuState();
      }
    },

    initSkuState() {
      const p = this.properties.product as ProductItem;
      if (!p || !p.colors || p.colors.length === 0) return;

      // 默认选中第一个颜色
      const defaultColor = p.colors[0];
      const dynamicSizes = this.computeSizesForColor(defaultColor, p.skus || [], p.sizes || []);

      // 默认选中第一个有库存的规格
      let defaultSize: ShoeSize | null = null;
      if (dynamicSizes && dynamicSizes.length > 0) {
        defaultSize = dynamicSizes.find(s => s.inStock) || dynamicSizes[0] || null;
      }

      this.setData({
        selectedColor: defaultColor,
        dynamicSizes,
        selectedSize: defaultSize,
        quantity: 1
      }, () => {
        this.updateSelectedText();
      });
    },

    onSelectColor(e: any) {
      const color = e.currentTarget.dataset.color as ShoeColor;
      const p = this.properties.product as ProductItem;
      const dynamicSizes = this.computeSizesForColor(color, p.skus || [], p.sizes || []);

      let nextSize = this.data.selectedSize;
      if (nextSize) {
        const matched = dynamicSizes.find(s => s.size === nextSize!.size);
        if (matched) {
          nextSize = matched;
        }
      }
      if (!nextSize || !nextSize.inStock) {
        nextSize = dynamicSizes.find(s => s.inStock) || dynamicSizes[0] || null;
      }

      this.setData({
        selectedColor: color,
        dynamicSizes,
        selectedSize: nextSize
      }, () => {
        this.updateSelectedText();
      });
    },

    onSelectSize(e: any) {
      const size = e.currentTarget.dataset.size as ShoeSize;
      if (!size.inStock) {
        wx.showToast({
          title: `规格 ${size.size} 暂时缺货`,
          icon: 'none'
        });
        return;
      }

      this.setData({ selectedSize: size }, () => {
        this.updateSelectedText();
      });
    },

    onMinus() {
      if (this.data.quantity > 1) {
        this.setData({ quantity: this.data.quantity - 1 }, () => {
          this.updateSelectedText();
        });
      }
    },

    onPlus() {
      const max = this.data.selectedSize ? (this.data.selectedSize.stockCount || 99) : 99;
      if (this.data.quantity < max) {
        this.setData({ quantity: this.data.quantity + 1 }, () => {
          this.updateSelectedText();
        });
      } else {
        wx.showToast({
          title: '已达到该规格最大可购数量',
          icon: 'none'
        });
      }
    },

    updateSelectedText() {
      const { selectedColor, selectedSize, quantity } = this.data;
      if (selectedColor && selectedSize) {
        this.setData({
          selectedText: `已选: ${selectedColor.name}，${selectedSize.size}，${quantity}件`
        });
      } else if (selectedColor) {
        this.setData({
          selectedText: `已选: ${selectedColor.name}，请选择规格`
        });
      } else {
        this.setData({
          selectedText: '请选择颜色及规格'
        });
      }
    },

    onClose() {
      this.triggerEvent('close');
    },

    onConfirm(e: any) {
      const type = e.currentTarget.dataset.type || this.properties.actionType;
      const { selectedColor, selectedSize, quantity } = this.data;
      const p = this.properties.product as ProductItem;

      if (!selectedColor) {
        wx.showToast({ title: '请选择商品颜色', icon: 'none' });
        return;
      }
      if (!selectedSize) {
        wx.showToast({ title: '请选择规格', icon: 'none' });
        return;
      }

      const targetSku = (p.skus || []).find((s: any) =>
        (s.colorName === selectedColor.name || s.colorId === selectedColor.id) &&
        Number(s.size) === Number(selectedSize.size)
      );
      const skuId = (selectedSize as any)?.skuId || targetSku?.skuId || (targetSku as any)?._id || (targetSku as any)?.id || `sku_${p.id}_${selectedColor.id || 'col'}_${selectedSize.size}`;

      this.triggerEvent('confirm', {
        actionType: type,
        color: selectedColor,
        size: selectedSize,
        sku: targetSku || null,
        skuId,
        quantity
      });

      this.onClose();
    },

    preventD() {
      // 阻止弹层滚动穿透
    }
  }
});
