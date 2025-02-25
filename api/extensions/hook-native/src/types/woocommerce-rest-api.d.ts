declare module '@woocommerce/woocommerce-rest-api' {
  interface WooCommerceRestApiConfig {
    url: string;
    consumerKey: string;
    consumerSecret: string;
    version: string;
  }

  class WooCommerceRestApi {
    constructor(config: WooCommerceRestApiConfig);
    get(endpoint: string): Promise<any>;
    post(endpoint: string, data: any): Promise<any>;
    put(endpoint: string, data: any): Promise<any>;
    delete(endpoint: string): Promise<any>;
  }

  export default WooCommerceRestApi;
}
