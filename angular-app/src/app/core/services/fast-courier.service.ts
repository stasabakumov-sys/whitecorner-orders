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
}

export interface FastCourierQuoteResponse {
  status: boolean;
  message: string;
  orderId: string;
  data: FastCourierQuote[];
}

export interface AddressTypeResponse {
  status: boolean;
  type: 'commercial' | 'residential' | 'unknown';
  business: boolean | null;
  residential: boolean | null;
  formattedAddress?: string;
}

@Injectable({ providedIn: 'root' })
export class FastCourierService {
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

  private async functionError(error: any) {
    try {
      const body = await error?.context?.json?.();
      return body?.message || body?.error || error.message;
    } catch {
      return error?.message || 'Fast Courier request failed.';
    }
  }
}
