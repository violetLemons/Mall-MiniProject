import { callCloud } from './cloud';

export interface PublicStore {
  mallName: string;
  companyName: string;
  creditCode: string;
  businessLicenseUrl: string;
  filingNumber: string;
  customerServicePhone: string;
  serviceHours: string;
  privacyContact: string;
  shipWithinHours: number;
}
export class StoreService {
  static get(): Promise<PublicStore> { return callCloud('products','storeSettings'); }
}
