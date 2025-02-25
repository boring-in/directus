import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { SalesChannel, WooCommerceProduct } from "./types";
import { AttributeSync } from "./AttributeSync";
import { OrderSync } from "./OrderSync";
import { ProductSync } from "./ProductSync";
import { GroupSync } from "./GroupSync";
import { TagSync } from "./TagSync";
import { BrandSync } from "./BrandSync";
import { FeatureSync } from "./FeatureSync";
import Product from "../Product";
//TODO update product  group import
/**
 * WoocommerceSync class handles synchronization between the system and WooCommerce
 */
class WoocommerceSync {
  private salesChannelProductService: any;
  private salesChannelService: any;
  private productService: any;
  private orderService: any;
  private customerService: any;
  private addressService: any;
  private countryService: any;
  private orderStatusMapService: any;
  private attributeService: any;
  private attributeValueService: any;
  private attributeValueProductService: any;
  private api: WooCommerceRestApi;
  private ItemsService: any;
  private schema: any;
  private salesChannel: SalesChannel;

  // Specialized sync handlers
  private attributeSync: AttributeSync;
  private orderSync: OrderSync;
  private productSync: ProductSync;
  private groupSync: GroupSync;
  private tagSync: TagSync;
  private brandSync: BrandSync;
  private featureSync: FeatureSync;

  constructor(ItemsService: any, schema: any, salesChannel: SalesChannel) {
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.salesChannel = salesChannel;

    // Initialize services
    this.salesChannelProductService = new ItemsService("sales_channel_products", { schema: schema });
    this.salesChannelService = new ItemsService("sales_channel", { schema: schema });
    this.productService = new ItemsService("product", { schema: schema });
    this.orderService = new ItemsService("orders", { schema: schema });
    this.customerService = new ItemsService("customers", { schema: schema });
    this.addressService = new ItemsService("address", { schema: schema });
    this.countryService = new ItemsService("country", { schema: schema });
    this.orderStatusMapService = new ItemsService("sales_channel_order_status_map", { schema: schema });
    this.attributeService = new ItemsService("attributes", { schema: schema });
    this.attributeValueService = new ItemsService("attribute_value", { schema: schema });
    this.attributeValueProductService = new ItemsService("attribute_value_product", { schema: schema });

    // Initialize WooCommerce API
    this.api = new WooCommerceRestApi({
      url: `https://` + salesChannel.domain_name,
      consumerKey: salesChannel.api_key,
      consumerSecret: salesChannel.secret_key,
      version: "wc/v3",
    });

    // Initialize specialized sync handlers
    this.attributeSync = new AttributeSync(this.api, this.ItemsService, this.schema);
    this.groupSync = new GroupSync(this.api, this.ItemsService, this.schema);
    this.tagSync = new TagSync(this.api, this.ItemsService, this.schema);
    this.brandSync = new BrandSync(this.api, this.ItemsService, this.schema);
    this.featureSync = new FeatureSync(this.api, this.ItemsService, this.schema);
    this.orderSync = new OrderSync(
      this.api,
      this.salesChannel,
      this.ItemsService,
      this.schema,
      this.orderService,
      this.orderStatusMapService
    );
    this.productSync = new ProductSync(
      this.api,
      this.salesChannel,
      this.ItemsService,
      this.schema,
      this.salesChannelProductService,
      this.attributeValueProductService,
      this.attributeValueService,
      this.attributeSync,
      this.tagSync,
      this.brandSync,
      this.featureSync,
      this.groupSync
    );
  }

  /**
   * Test method for product attributes
   */
  async test(input: string): Promise<void> {
    const Prdct = new Product(this.ItemsService, this.schema);
    const numericInput = Number(input);
    if (isNaN(numericInput)) {
      throw new Error('Input must be a valid number');
    }
    const id: number = numericInput;
    await Prdct.getAllChildProductAttributes(id);
  }

  // Order related methods
  async createOrder(orderId: string): Promise<void> {
    console.log("createOrder", orderId);
    
    return this.orderSync.createOrder(orderId);
  }

  async localOrderStatusUpdate(orderId: string, statusName: string): Promise<void> {
    return this.orderSync.localOrderStatusUpdate(orderId, statusName);
  }

  async outsideOrderStatusUpdate(orderId: string, statusId: string): Promise<void> {
    return this.orderSync.outsideOrderStatusUpdate(orderId, statusId);
  }

  // Product related methods
  async syncProduct(productId: string): Promise<void> {
    return this.productSync.syncProduct(productId);
  }

  async syncWithPos(salesChannelArray: SalesChannel[], productId: string, quantity: number): Promise<void> {
    return this.productSync.syncWithPos(salesChannelArray, productId, quantity);
  }

  async syncProductDownstream(productId: string): Promise<void> {
    return this.productSync.syncProductDownstream(productId);
  }

  async syncAllProductsDownstream(): Promise<void> {
    return this.productSync.syncAllProductsDownstream();
  }

  // Attribute related methods
  async syncAttribute(attributeId: string): Promise<any> {
    return this.attributeSync.syncAttribute(attributeId);
  }

  /**
   * Imports all attributes from WooCommerce to local system
   * @returns Summary of sync operation including counts of created/updated/failed items
   */
  async importAttributesFromWooCommerce(): Promise<any> {
    return this.attributeSync.importAttributesFromWooCommerce();
  }

  // Group related methods
  /**
   * Imports all product categories from WooCommerce as groups
   */
  async importAllGroups(): Promise<void> {
    return this.groupSync.importGroups();
  }

  /**
   * Imports a single category and its products from WooCommerce
   */
  async importGroupByCategory(categoryId: number): Promise<void> {
    return this.groupSync.importGroupByCategory(categoryId);
  }

  /**
   * Imports all product tags from WooCommerce
   */
  async importAllTags(): Promise<void> {
    return this.tagSync.importTags();
  }

  /**
   * Syncs tags for a specific product
   */
  async syncProductTags(productId: string, wcProductId: string): Promise<void> {
    return this.tagSync.syncProductTags(productId, wcProductId);
  }

  /**
   * Imports all brands from WooCommerce
   */
  async importAllBrands(): Promise<void> {
    return this.brandSync.importBrands();
  }

  /**
   * Imports all features from WooCommerce (taxonomies and non-variation attributes)
   */
  async importAllFeatures(): Promise<void> {
    return this.featureSync.importFeatures();
  }

  /**
   * Syncs brand for a specific product
   */
  async syncProductBrand(productId: string, wcProductId: string): Promise<void> {
    return this.brandSync.syncProductBrand(productId, wcProductId);
  }

  // Stock related methods
  /**
   * Updates WooCommerce stock for all products from local system (upstream)
   */
  async syncAllStockUpstream(): Promise<void> {
    return this.productSync.syncAllStockUpstream();
  }

  /**
   * Updates stock for all products in the sales channel from WooCommerce (downstream)
   */
  async syncAllSalesChannelStock(): Promise<void> {
    return this.productSync.syncAllSalesChannelStock();
  }

  /**
   * Updates WooCommerce stock from local system (upstream)
   * @param productId Local product ID
   */
  /**
   * Updates WooCommerce stock from local system (upstream)
   * @param productId Local product ID
   */
  async syncStockUpstream(productId: string): Promise<void> {
    return this.productSync.syncStockUpstream(productId);
  }

  /**
   * Updates local stock from WooCommerce (downstream)
   * @param wcProductId WooCommerce product ID
   * @param localProductId Local product ID
   */
  async syncStockDownstream(wcProductId: string, localProductId: string): Promise<void> {
    try {
      const wcProductResponse = await this.api.get(`products/${wcProductId}`);
      const wcProduct = wcProductResponse.data as WooCommerceProduct;
      
      if (!wcProduct) {
        throw new Error(`No WooCommerce product found for ID ${wcProductId}`);
      }

      return this.productSync.importProductStock(wcProduct, localProductId);
    } catch (error) {
      console.error(`Failed to sync stock downstream for product ${localProductId}:`, error);
      throw error;
    }
  }
}

export default WoocommerceSync;
