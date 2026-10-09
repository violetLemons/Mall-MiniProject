"use strict";
Component({
    properties: {
        list: {
            type: Array,
            value: [],
            observer(newVal) {
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
                desc: '快递配送',
                imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&auto=format&fit=crop&q=80',
                color: '#FF5500',
                bgColor: '#FFF5F0'
            },
            {
                id: 'new_arrivals',
                tag: '实时上新',
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
        applyCustomList(customList) {
            const current = this.data.sections;
            const updated = current.map((sec, idx) => {
                const found = customList.find(c => c.id === sec.id || c.title === sec.title || c.key === sec.id) || customList[idx];
                if (found && found.imageUrl) {
                    return Object.assign(Object.assign({}, sec), { imageUrl: found.imageUrl, title: found.title || sec.title, desc: found.desc || sec.desc, tag: found.tag || sec.tag });
                }
                return sec;
            });
            this.setData({ sections: updated });
        }
    }
});
