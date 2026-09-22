import { callCloud } from './cloud';

export interface PickupPoint { id: string; _id?: string; name: string; address: string; hours?: string; status?: string; }
export class PickupService {
  static async list(): Promise<PickupPoint[]> {
    const rows = await callCloud<PickupPoint[]>('pickupPoints', 'list', {});
    return (rows || []).map(point => ({ ...point, id: point.id || point._id || '' }));
  }
}
