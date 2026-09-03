import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface FastCourierItem {
  type: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  quantity: number;
  contents: string;
}

export interface FastCourierQuoteRequest {
  pickupSuburb: string;
  pickupState: string;
  pickupPostcode: number;
  pickupBuildingType: 'commercial' | 'residential';
  isPickupTailLift: boolean;
  destinationSuburb: string;
  destinationState: string;
  destinationPostcode: number;
  destinationBuildingType: 'commercial' | 'residential';
  isDropOffTailLift: boolean;
  isDropOffPOBox: boolean;
  items: FastCourierItem[];
}

export interface FastCourierNotice {
  body?: string | null;
  requires_consent?: boolean;
  consent_text?: string | null;
}

export interface FastCourierQuote {
  id: string;
  quote_id?: number;
  courierId?: number;
  courierName?: string;
  name?: string;
  eta?: string;
  pickupCutOffTime?: string;
  priceExcludingGst?: number;
  priceIncludingGst?: number;
  rating?: number;
  logo?: string;
  insuranceCategory?: string;
  insurance_link?: string;
  subLabel?: string | null;
  selectedDays?: string[];
  transitAmount?: number | null;
  notice?: FastCourierNotice | null;
  insurance?: FastCourierInsuranceSelection;
}

export interface FastCourierQuoteResponse {
  status: boolean;
  message: string;
  orderId: string;
  data: FastCourierQuote[];
}

export interface FastCourierInsuranceSelection {
  tier: number;
  required: boolean;
  goodsValue: number;
  extendedLiability: boolean;
  insuranceValue: number;
  insuranceFee: number;
  label: string;
}

export interface AddressTypeResponse {
  status: boolean;
  type: 'commercial' | 'residential' | 'unknown';
  business: boolean | null;
  residential: boolean | null;
  formattedAddress?: string;
}

export interface FastCourierBookingDetails {
  quoteId: string;
  senderType: 'sender';
  pickupFirstName: string;
  pickupLastName: string;
  pickupCompanyName: string;
  pickupEmail: string;
  pickupAddress1: string;
  pickupAddress2: string;
  pickupPhone: string;
  destinationFirstName: string;
  destinationLastName: string;
  destinationCompanyName: string;
  destinationEmail: string;
  destinationAddress1: string;
  destinationAddress2: string;
  destinationPhone: string;
  collectionDate: string;
  pickupTimeWindow: string;
  parcelContent: string;
  specialInstructions: string;
  valueOfContent: number;
  authorityToLeave: boolean;
  noPrinter: boolean;
  extendedLiability: string;
  insuranceValue: string;
  insuranceFee: string;
  acceptInsuranceConditions: boolean;
  acceptTermConditions: boolean;
  acceptAttachment: boolean;
  acceptNoDangerousGoods: boolean;
  acceptReadFinancialServiceGuide: boolean;
  emailForDocuments: string;
  additionalEmailsForDocuments: { email: string }[];
}

export interface StoredCourierDocument { path: string; }
export interface FastCourierOrderStatus {
  status: boolean;
  message?: string;
  orderStatus?: string;
  consignmentNumber?: string;
  articleId?: string;
  jobNumber?: string;
  documents?: { label?: string|null; invoice?: string|null; manifest?: string|null };
  storedDocuments?: { label?: StoredCourierDocument; invoice?: StoredCourierDocument; manifest?: StoredCourierDocument };
  documentStorageError?: string;
}

@Injectable({ providedIn: 'root' })
export class FastCourierService {
  private insuranceOptionsRequest: Promise<string[]> | null = null;
  constructor(private supabase: SupabaseService) {}

  async getQuotes(request: FastCourierQuoteRequest): Promise<FastCourierQuoteResponse> {
    const { data, error } = await this.supabase.client.functions.invoke(environment.fastCourierFunction, {
      body: { action: 'quotes', payload: request },
    });
    if (error) throw new Error(await this.functionError(error));
    if (!data?.status) throw new Error(data?.message || 'Fast Courier could not retrieve quotes.');
    return data as FastCourierQuoteResponse;
  }

  async detectAddressType(address: Record<string, unknown>): Promise<AddressTypeResponse> {
    const { data, error } = await this.supabase.client.functions.invoke(environment.fastCourierFunction, {
      body: { action: 'address-type', payload: address },
    });
    if (error) throw new Error(await this.functionError(error));
    if (!data?.status) throw new Error(data?.message || 'Google could not check the address type.');
    return data as AddressTypeResponse;
  }

  getInsuranceOptions(): Promise<string[]> {
    if (this.insuranceOptionsRequest) return this.insuranceOptionsRequest;
    this.insuranceOptionsRequest = this.loadInsuranceOptions().catch((error) => {
      this.insuranceOptionsRequest = null;
      throw error;
    });
    return this.insuranceOptionsRequest;
  }

  private async loadInsuranceOptions(): Promise<string[]> {
    const { data, error } = await this.supabase.client.functions.invoke(environment.fastCourierFunction, {
      body: { action: 'insurance-list' },
    });
    if (error) throw new Error(await this.functionError(error));
    if (!data?.status || !Array.isArray(data?.data)) throw new Error(data?.message || 'Fast Courier insurance options are unavailable.');
    return data.data.map((value: unknown) => String(value));
  }

  async saveOrderDetails(orderId: string, payload: FastCourierBookingDetails): Promise<void> {
    const data = await this.invoke({ action: 'save-order-details', orderId, payload });
    if (!data?.status) throw new Error(this.responseError(data, 'Fast Courier could not save the order details.'));
  }

  async bookOrder(orderId: string): Promise<void> {
    const data = await this.invoke({ action: 'booking', orderId });
    if (!data?.status) throw new Error(data?.message || 'Fast Courier could not start the booking.');
  }

  async getOrderStatus(orderId: string): Promise<FastCourierOrderStatus> {
    const data = await this.invoke({ action: 'order-status', orderId });
    if (!data?.status) throw new Error(data?.message || 'Fast Courier could not retrieve the booking status.');
    return data as FastCourierOrderStatus;
  }

  async getStoredDocumentUrl(path: string): Promise<string> {
    const data = await this.invoke({ action: 'document-url', path });
    if (!data?.status || !data?.url) throw new Error(data?.message || 'The document is unavailable.');
    return String(data.url);
  }

  private async invoke(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabase.client.functions.invoke(environment.fastCourierFunction, { body });
    if (error) throw new Error(await this.functionError(error));
    return data;
  }

  private async functionError(error: any) {
    try {
      const body = await error?.context?.json?.();
      return this.responseError(body, error.message);
    } catch {
      return error?.message || 'Fast Courier request failed.';
    }
  }

  private responseError(body: any, fallback: string) {
    // Fast Courier may hide additional validation messages behind "and more errors".
    const details = body?.errors && typeof body.errors === 'object'
      ? Object.values(body.errors).flatMap((value: any) => Array.isArray(value) ? value : [value]).map(String).filter(Boolean)
      : [];
    return details.length ? details.join(' ') : (body?.message || body?.error || fallback);
  }
}
