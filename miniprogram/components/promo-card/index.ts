Component({
  properties: {
    list: {
      type: Array,
      value: [],
      observer(newVal: any[]) {
        if (Array.isArray(newVal) && newVal.length > 0) {
          this.applyCustomList(newVal);
        }
      }
    }
  },

  data: {
    sections: [
      {
        id: 'shipping',
        tag: '配送服务',
        title: '全场包邮',
        desc: '极速空运实时查询',
        imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&auto=format&fit=crop&q=80',
        color: '#FF5500',
        bgColor: '#FFF5F0'
      },
      {
        id: 'pickup',
        tag: '校园服务',
        title: '到店自提',
        desc: '支持预约与核销',
        imageUrl: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=200&auto=format&fit=crop&q=80',
        color: '#E53935',
        bgColor: '#FFF0F0'
      },
      {
        id: 'new_arrivals',
        tag: '云端库存',
        title: '新品上架',
        desc: '实时同步在售款式',
        imageUrl: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=200&auto=format&fit=crop&q=80',
        color: '#2979FF',
        bgColor: '#F0F5FF'
      },
      {
        id: 'size_guide',
        tag: '规格参考',
        title: '规格指南',
        desc: '多规格可选',
        imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=200&auto=format&fit=crop&q=80',
        color: '#111111',
        bgColor: '#F4F5F7'
      }
    ]
  },

  methods: {
    applyCustomList(customList: any[]) {
      const current = this.data.sections;
      const updated = current.map((sec, idx) => {
        const found = customList.find(c => c.id === sec.id || c.title === sec.title || c.key === sec.id) || customList[idx];
        if (found && found.imageUrl) {
          return {
            ...sec,
            imageUrl: found.imageUrl,
            title: found.title || sec.title,
            desc: found.desc || sec.desc,
            tag: found.tag || sec.tag
          };
        }
        return sec;
      });
      this.setData({ sections: updated });
    }
  }
});
