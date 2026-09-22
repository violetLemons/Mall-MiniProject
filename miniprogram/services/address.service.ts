import { callCloud } from './cloud';

export interface CloudAddress {
  _id?: string;
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  tag?: string;
  isDefault?: boolean;
  updatedAt?: string | Date | number;
  updateTime?: string | Date | number;
}

export class AddressService {
  static async list(): Promise<CloudAddress[]> {
    return callCloud<CloudAddress[]>('addresses', 'list', {});
  }
  static async getDefault(): Promise<CloudAddress | null> {
    const list = await this.list();
    return list.find(item => item.isDefault) || list[0] || null;
  }
  static async save(address: Omit<CloudAddress, 'id'> & { id?: string }): Promise<CloudAddress> {
    return callCloud<CloudAddress>('addresses', 'save', address);
  }
  static async remove(id: string): Promise<void> {
    await callCloud('addresses', 'delete', { id });
  }
}
