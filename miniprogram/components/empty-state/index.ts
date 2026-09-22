Component({
  properties: {
    title: {
      type: String,
      value: '暂无相关商品'
    },
    description: {
      type: String,
      value: '换个搜索词或去其他分类逛逛吧'
    },
    showAction: {
      type: Boolean,
      value: false
    },
    actionText: {
      type: String,
      value: '去首页逛逛'
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
