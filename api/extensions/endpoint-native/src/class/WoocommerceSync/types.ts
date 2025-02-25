export interface SalesChannel {
  id: string;
  domain_name: string;
  api_key: string;
  secret_key: string;
  OpenPos_outlet_id?: string;
  default_warehouse?: number;
}

export interface ShippingAddress {
  country: string;
  city: string;
  address: string;
  postcode: string;
}

export interface OrderedProductData {
  product: string;
  quantity: number;
  tax_rate: number;
  total: number;
  name: string;
  attributes: Array<{
    name: string;
    slug: string;
    value: string | number;
  }>;
  orderedProductData: {
    product: string;
  };
  app_warehouse?: string;
}

export interface WooCommerceOrderLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  tax_class: string;
  subtotal: string;
  subtotal_tax: string;
  total: string;
  total_tax: string;
  taxes: Array<{
    id: number;
    total: string;
    subtotal: string;
  }>;
  meta_data: Array<{
    key: string;
    value: string;
  }>;
}

export interface CustomerData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  sales_channel: string;
  parent_customer?: string;
  phone: string;
  phone_mobile: string;
}

export interface ProductJson {
  externalId: string;
  parentId: string;
  name: string;
  sku: string;
  parent_sku: string;
  brand:string;
  is_parent: boolean;
  salesChannelId?: string|number;
  attributes?: Array<{
    name: string;
    slug: string;
    value: string;
  }>;
  features?: Array<{
    name: string;
    value: string;
  }>;
  quantity?: number;
  total?: number;
  tax_rate?: number;
}

export interface WooCommerceProduct {
  id: string;
  name: string;
  type: string;
  sku: string;
  parent_id?: string;
  attributes?: Array<{
    id: number;
    name: string;
    slug: string;
    option?: string;
    options?: string[];
    variation?: boolean;
  }>;
  brands: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  variations?: string[];
  data?: any;
  stock_quantity?: number;
  manage_stock?: boolean;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  categories?: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}

export interface WooCommerceStock {
  product_id: string;
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
}

export interface WooCommerceVariation {
  id: string;
  sku: string;
  attributes: Array<{
    name: string;
    option: string;
  }>;
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
}

export interface LocalGroup {
  id?: string | number;
  name: string;
  parent_group?: string | number | null;
}

export interface WooCommerceTag {
  id: number;
  name: string;
  slug: string;
}

export interface LocalTag {
  id?: number;
  name: string;
}

export interface WPTaxonomy {
  name: string;
  slug: string;
  description: string;
  types: string[];
  rest_base: string;
}

