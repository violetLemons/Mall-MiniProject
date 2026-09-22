"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
Component({
    properties: {
        list: {
            type: Array,
            value: []
        }
    },
    methods: {
        onTapProduct(e) {
            this.triggerEvent('click', e.detail);
        }
    }
});
