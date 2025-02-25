import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { ProductJson, SalesChannel, WooCommerceProduct, WooCommerceVariation } from "./types";
import Product from "../Product";
import { AttributeSync } from "./AttributeSync";
import { FeatureSync } from "./FeatureSync";
import { GroupSync } from "./GroupSync";

interface ProductAttribute {
  id: number;
  name: string;
  slug: string;
  option?: string;
  options?: string[];
  variation?: boolean;
}

export class ProductSync {
  private api: WooCommerceRestApi;
  private salesChannel: SalesChannel;
  private ItemsService: any;
  private schema: any;
  private salesChannelProductService: any;
  private attributeValueProductService: any;
  private attributeValueService: any;
  private attributeSync: AttributeSync;
  private tagSync: any;
  private brandSync: any;
  private featureSync: FeatureSync;
  private groupSync: GroupSync;
  private stockService: any;
  private productService: any;
  private readonly BATCH_SIZE = 20; // Number of products to process in parallel
  private readonly MAX_RETRIES = 3;  // Maximum number of retry attempts for failed operations
  private readonly RETRY_DELAY = 1000; // Delay between retries in milliseconds

  constructor(
    api: WooCommerceRestApi,
    salesChannel: SalesChannel,
    ItemsService: any,
    schema: any,
    salesChannelProductService: any,
    attributeValueProductService: any,
    attributeValueService: any,
    attributeSync: AttributeSync,
    tagSync: any,
    brandSync: any,
    featureSync: FeatureSync,
    groupSync: GroupSync
  ) {
    this.api = api;
    this.salesChannel = salesChannel;
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.salesChannelProductService = salesChannelProductService;
    this.attributeValueProductService = attributeValueProductService;
    this.attributeValueService = attributeValueService;
    this.attributeSync = attributeSync;
    this.tagSync = tagSync;
    this.brandSync = brandSync;
    this.featureSync = featureSync;
    this.groupSync = groupSync;
    this.stockService = new ItemsService("stock", { schema });
    this.productService = new ItemsService("product", { schema });
  }

  

  /**
   * Check if sales channel product exists
   */
  private async checkSalesChannelProduct(wcProductId: string, productId: string | number): Promise<boolean> {
    const existingProduct = await this.salesChannelProductService.readByQuery({
      filter: {
        _and: [
          { sales_channel: this.salesChannel.id },
          { sales_channel_product_id: wcProductId },
          { product: productId }
        ]
      }
    });
    return existingProduct && existingProduct.length > 0;
  }

  /**
   * Create sales channel product if it doesn't exist
   */
  private async createSalesChannelProductIfNotExists(wcProductId: string, product: any): Promise<void> {
    const exists = await this.checkSalesChannelProduct(wcProductId, product.product_id);
    if (!exists) {
      await this.salesChannelProductService.createOne({
        sales_channel: this.salesChannel.id,
        sales_channel_product_id: wcProductId,
        product: product.product_id,
        sales_channel_product_name: product.name || 'Unnamed Product'
      });
      console.log(`Created sales channel product mapping for ${wcProductId}`);
    } else {
      console.log(`Sales channel product mapping already exists for ${wcProductId}`);
    }
  }

  /**
   * Import and map categories for a product
   */
  private async importAndMapCategories(wcProduct: WooCommerceProduct, productId: string | number): Promise<void> {
    if (wcProduct.categories) {
      for (const category of wcProduct.categories) {
        try {
          await this.groupSync.importGroupByCategory(category.id);
        } catch (error) {
          console.warn(`Failed to import category ${category.id} for product ${productId}:`, error);
          // Continue with next category
        }
      }
    }
  }

  /**
   * Imports product stock from WooCommerce
   */
  async importProductStock(wcProduct: WooCommerceProduct, localProductId: string | number): Promise<void> {
    try {
      // Get current local stock data
      const existingStock = await this.stockService.readByQuery({
        filter: {
          _and: [
            { product: localProductId },
            { warehouse: this.salesChannel.default_warehouse }
          ]
        }
      });

      // Calculate WooCommerce stock quantity
      let wcStockQuantity = 0;
      if (wcProduct.manage_stock && wcProduct.stock_quantity !== undefined) {
        wcStockQuantity = wcProduct.stock_quantity;
      } else {
        wcStockQuantity = wcProduct.stock_status === 'instock' ? 1 : 0;
      }

      // Check if stock update is needed
      if (!existingStock || existingStock.length === 0) {
        // Create new stock record if it doesn't exist
        const stockData = {
          product: localProductId,
          warehouse: this.salesChannel.default_warehouse,
          onhand_quantity: wcStockQuantity,
          available_quantity: wcStockQuantity,
          ordered_quantity: 0,
          reserved_quantity: 0
        };
        await this.stockService.createOne(stockData);
        console.log(`Created new stock record for product ${localProductId} with quantity ${wcStockQuantity}`);
      } else {
        const currentStock = existingStock[0];
        // Only update if quantities are different
        if (currentStock.available_quantity !== wcStockQuantity) {
          const stockData = {
            onhand_quantity: wcStockQuantity,
            available_quantity: wcStockQuantity
          };
          await this.stockService.updateOne(currentStock.id, stockData);
          console.log(`Updated stock for product ${localProductId} from ${currentStock.available_quantity} to ${wcStockQuantity}`);
        } else {
          console.log(`Stock for product ${localProductId} is already up to date (${wcStockQuantity})`);
        }
      }
    } catch (error) {
      console.error(`Failed to import stock for product ${localProductId}:`, error);
      throw error;
    }
  }

  /**
   * Process a batch of products with retry mechanism
   */
  private async processBatch(products: WooCommerceProduct[]): Promise<void> {
    const batchPromises = products.map(async (product) => {
      let retries = 0;
      while (retries < this.MAX_RETRIES) {
        try {
          await this.syncProductDownstream(product.id);
          console.log(`Successfully synced product ${product.id} (${product.name})`);
          return;
        } catch (error) {
          retries++;
          if (retries === this.MAX_RETRIES) {
            console.error(`Failed to sync product ${product.id} (${product.name}) after ${this.MAX_RETRIES} attempts:`, error);
          } else {
            console.warn(`Retry ${retries}/${this.MAX_RETRIES} for product ${product.id}`);
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          }
        }
      }
    });

    await Promise.all(batchPromises);
  }

  /**
   * Check for existing products in batch
   */
  private async filterExistingProducts(products: WooCommerceProduct[]): Promise<WooCommerceProduct[]> {
    const productIds = products.map(p => p.id);
    
    const existingProducts = await this.salesChannelProductService.readByQuery({
      filter: {
        _and: [
          { sales_channel: this.salesChannel.id },
          { sales_channel_product_id: { _in: productIds } }
        ]
      }
    });

    const existingProductIds = new Set(existingProducts.map((p: { sales_channel_product_id: string }) => p.sales_channel_product_id));
    
    return products.filter(product => !existingProductIds.has(product.id));
  }

  /**
   * Syncs product with WooCommerce (upstream)
   */
  async syncProduct(productId: string): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    const prdct = new Product(this.ItemsService, this.schema);
    const appProduct = await prdct.getProductById(productId);

    if (!appProduct) {
      throw new Error('Product not found');
    }

    if (appProduct.child_products == null && appProduct.parent_product == null) {
      const newWcProduct = await this.api.post("products", {
        name: appProduct.name,
        type: "simple",
        sku: appProduct.sku
      });
      await this.createSalesChannelProductIfNotExists(newWcProduct.data.id.toString(), appProduct);
      await this.syncStockUpstream(appProduct.product_id);
    }
    else {
      let parentProduct;
      if (appProduct.parent_product != null) {
        parentProduct = await prdct.getProductById(appProduct.parent_product);
      }
      else {
        parentProduct = appProduct;
      }

      if (!parentProduct || !parentProduct.product_id) {
        throw new Error('Parent product not found');
      }

      const neededAttributes = await prdct.getAllChildProductAttributes(
        typeof parentProduct.product_id === 'string' 
          ? parseInt(parentProduct.product_id, 10)
          : parentProduct.product_id
      );
      
      const wcAttributes = [];
      for (const attr of neededAttributes) {
        if (attr && attr.attributeId) {
          const wcAttribute = await this.attributeSync.syncAttribute(attr.attributeId.toString());
          if (wcAttribute && wcAttribute.id) {
            wcAttributes.push({
              id: wcAttribute.id,
              visible: true,
              variation: true,
              options: attr.values
            });
          }
        }
      }

      const newWcParentProduct = await this.api.post("products", {
        name: parentProduct.name,
        sku: parentProduct.sku,
        type: "variable",
        attributes: wcAttributes
      });
      const wcParentProductId = newWcParentProduct.data.id;
      await this.createSalesChannelProductIfNotExists(wcParentProductId.toString(), parentProduct);
      await this.syncStockUpstream(parentProduct.product_id);

      if (parentProduct.child_products) {
        for (let i = 0; i < parentProduct.child_products.length; i++) {
          const childProduct = await prdct.getProductById(parentProduct.child_products[i]);
          if (childProduct && childProduct.attribute_value) {
            const childAttributes = childProduct.attribute_value;
            const attributeJsonArray = [];

            for (let x = 0; x < childAttributes.length; x++) {
              const attributeValueProduct = await this.attributeValueProductService.readOne(childAttributes[x]);
              if (attributeValueProduct) {
                const attributeValue = await this.attributeValueService.readOne(attributeValueProduct.attribute_value_id);
                if (attributeValue && attributeValue.attribute) {
                  const wcAttribute = await this.attributeSync.syncAttribute(attributeValue.attribute.toString());
                  attributeJsonArray.push({ 
                    id: wcAttribute.id, 
                    option: attributeValue.value 
                  });
                }
              }
            }
            const data = { attributes: attributeJsonArray };
            const wcChildProduct = await this.api.post(`products/${wcParentProductId}/variations`, data);
            await this.createSalesChannelProductIfNotExists(wcChildProduct.data.id.toString(), childProduct);
            await this.syncStockUpstream(childProduct.product_id);
          }
        }
      }
    }
  }

  /**
   * Syncs product quantity with POS system
   */
  async syncWithPos(salesChannelArray: SalesChannel[], productId: string, quantity: number): Promise<void> {
    try {
      for (let i = 0; i < salesChannelArray.length; i++) {
        const salesChannel = salesChannelArray[i];
        if (!salesChannel) continue;

        const salesChannelProduct =
          await this.salesChannelProductService.readByQuery({
            filter: {
              _and: [
                { sales_channel: salesChannel.id },
                { product: productId },
              ],
            },
          });
        if (salesChannelProduct && salesChannelProduct.length > 0) {
          const salesChannelExternalId =
            salesChannelProduct[0].sales_channel_product_id;
          const posOutletId = salesChannel.OpenPos_outlet_id;
          await this.api.put(`products/${salesChannelExternalId}`, {
            meta_data: [
              { key: `_op_qty_warehouse_${posOutletId}`, value: `${quantity}` },
            ],
          });
        }
      }
    } catch (err) {
      console.error("Error syncing with POS:", err);
    }
  }

  /**
   * Updates WooCommerce stock for all products from local system (upstream)
   */
  async syncAllStockUpstream(): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    try {
      // Get all sales channel products
      const salesChannelProducts = await this.salesChannelProductService.readByQuery({
        filter: {
          sales_channel: this.salesChannel.id
        }
      });

      console.log(`Found ${salesChannelProducts.length} products to sync stock for...`);

      for (const salesChannelProduct of salesChannelProducts) {
        try {
          await this.syncStockUpstream(salesChannelProduct.product);
          console.log(`Successfully synced stock for product ${salesChannelProduct.product}`);
        } catch (error) {
          console.error(`Failed to sync stock for product ${salesChannelProduct.product}:`, error);
          // Continue with next product
          continue;
        }
      }

      console.log('Stock sync completed');
    } catch (error) {
      console.error('Failed to sync sales channel stock:', error);
      throw error;
    }
  }

  /**
   * Updates stock for all sales channel products from WooCommerce (downstream)
   */
  async syncAllSalesChannelStock(): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    try {
      // Get all sales channel products
      const salesChannelProducts = await this.salesChannelProductService.readByQuery({
        filter: {
          sales_channel: this.salesChannel.id
        },limit: -1
      });

      console.log(`Found ${salesChannelProducts.length} products to sync stock for...`);

      for (const salesChannelProduct of salesChannelProducts) {
        try {
          // Get WooCommerce product data
          const wcProductResponse = await this.api.get(`products/${salesChannelProduct.sales_channel_product_id}`);
          const wcProduct = wcProductResponse.data as WooCommerceProduct;

          if (!wcProduct) {
            console.warn(`No WooCommerce product found for sales channel product ${salesChannelProduct.id}`);
            continue;
          }

          // Import stock data
          await this.importProductStock(wcProduct, salesChannelProduct.product);
          console.log(`Successfully synced stock for product ${salesChannelProduct.product}`);
        } catch (error) {
          console.error(`Failed to sync stock for product ${salesChannelProduct.product}:`, error);
          // Continue with next product
          continue;
        }
      }

      console.log('Stock sync completed');
    } catch (error) {
      console.error('Failed to sync sales channel stock:', error);
      throw error;
    }
  }

  /**
   * Syncs product stock from local system to WooCommerce
   */
  async syncStockUpstream(productId: string | number): Promise<void> {
    try {
      // Get stock from local system
      const stockData = await this.stockService.readByQuery({
        filter: {
          _and: [
            { product: productId },
            { warehouse: this.salesChannel.default_warehouse }
          ]
        }
      });

      if (!stockData || stockData.length === 0) {
        console.warn(`No stock data found for product ${productId}`);
        return;
      }

      // Get product data to check if it's a variation
      const productData = await this.productService.readOne(productId);
      if (!productData) {
        console.warn(`No product data found for product ${productId}`);
        return;
      }

      // Get sales channel product to get WooCommerce product ID
      const salesChannelProduct = await this.salesChannelProductService.readByQuery({
        filter: {
          _and: [
            { product: productId },
            { sales_channel: this.salesChannel.id }
          ]
        }
      });

      if (!salesChannelProduct || salesChannelProduct.length === 0) {
        console.warn(`No sales channel product found for product ${productId}`);
        return;
      }

      const wcProductId = salesChannelProduct[0].sales_channel_product_id;
      const stock = stockData[0];

      // Prepare stock data for WooCommerce
      const wcStockData = {
        stock_quantity: stock.available_quantity,
        manage_stock: true,
        stock_status: stock.available_quantity > 0 ? 'instock' : 'outofstock'
      };

      // Check if this is a variation (child product)
      if (productData.parent_product) {
        // Get parent product's WooCommerce ID
        const parentSalesChannelProduct = await this.salesChannelProductService.readByQuery({
          filter: {
            _and: [
              { product: productData.parent_product },
              { sales_channel: this.salesChannel.id }
            ]
          }
        });

        if (!parentSalesChannelProduct || parentSalesChannelProduct.length === 0) {
          console.warn(`No parent sales channel product found for variation ${productId}`);
          return;
        }

        const parentWcProductId = parentSalesChannelProduct[0].sales_channel_product_id;

        // Update variation stock using correct endpoint
        await this.api.put(`products/${parentWcProductId}/variations/${wcProductId}`, wcStockData);
        console.log(`Updated stock for variation ${productId} in WooCommerce: ${stock.available_quantity}`);
      } else {
        // Regular product update
        await this.api.put(`products/${wcProductId}`, wcStockData);
        console.log(`Updated stock for product ${productId} in WooCommerce: ${stock.available_quantity}`);
      }

    } catch (error) {
      console.error(`Failed to sync stock upstream for product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Syncs products from WooCommerce to local system (downstream)
   */
  async syncProductDownstream(productId: string): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    try {
      console.log(`Syncing product ${productId} downstream...`);
      
      const wcProductResponse = await this.api.get(`products/${productId}`);
      const wcProduct = wcProductResponse.data as WooCommerceProduct;

      // More lenient validation
      if (!wcProduct) {
        throw new Error('No product data received from WooCommerce');
      }

      const prdct = new Product(this.ItemsService, this.schema);

      if (wcProduct.type === 'simple') {
        let brand;
        if(wcProduct.brands && wcProduct.brands.length > 0) {
          //@ts-ignore
          brand = wcProduct.brands[0].name;
        }
        const productJson: ProductJson = {
          externalId: wcProduct.id,
          parentId: wcProduct.id,
          name: wcProduct.name || 'Unnamed Product',
          sku: wcProduct.sku || `wc-${wcProduct.id}`,
          parent_sku: wcProduct.sku || `wc-${wcProduct.id}`,
          salesChannelId: this.salesChannel.id,
          is_parent: true,
          //@ts-ignore
          brand:brand
          // features: wcProduct.attributes?.map((attr: ProductAttribute) => ({
          //   name: attr.name,
          //   slug: attr.slug,
          //   value: attr.option || ''
          // }))
        };

        const product = await prdct.getProductBySku(productJson);
        if (product) {
          // Update product name if it exists
          await this.productService.updateOne(product.product_id, {
            name: wcProduct.name || 'Unnamed Product'
          });
          
          await this.createSalesChannelProductIfNotExists(wcProduct.id, product);
          await this.importProductStock(wcProduct, product.product_id);
          await this.tagSync.syncProductTags(product.product_id, wcProduct.id);
         // await this.brandSync.syncProductBrand(product.product_id, wcProduct.id);

         if(wcProduct.categories) {
            for(const category of wcProduct.categories) {

          // Import and map categories after product creation
            await this.groupSync.setGroupSimple(product.product_id, category.name);
            }
         }
        
          // set wcProduct.attributes as features, as this is not variable product and non varibale attribute

          if (wcProduct.attributes) {
            for (const attr of wcProduct.attributes) {
              // Only process non-variable attributes with valid options
              if (!attr.variation && attr.name && attr.options && attr.options.length > 0) {
                const featureName = attr.name;
                const featureValue = attr.options[0];
                if (featureName && featureValue) {
                  await this.featureSync.setFeatureSimple(product.product_id, featureName, featureValue);
                }
              }
            }
          }
        }
      } 

      else if (wcProduct.type === 'variable') {
        let brand;
        if(wcProduct.brands && wcProduct.brands.length > 0) {
          //@ts-ignore
          brand = wcProduct.brands[0].name;
        }
        const productJson: ProductJson = {
          externalId: wcProduct.id,
          parentId: wcProduct.id,
          name: wcProduct.name || 'Unnamed Product',
          sku: wcProduct.sku || `wc-${wcProduct.id}`,
          parent_sku: wcProduct.sku || `wc-${wcProduct.id}`,
          is_parent: true,
          salesChannelId: this.salesChannel.id,
          //@ts-ignore
          brand:brand
        };
  
        const parentProduct = await prdct.getProductBySku(productJson);
        if (parentProduct) {
          // Update parent product name if it exists
          await this.productService.updateOne(parentProduct.product_id, {
            name: wcProduct.name || 'Unnamed Product'
          });
          
          await this.createSalesChannelProductIfNotExists(wcProduct.id, parentProduct);
          await this.tagSync.syncProductTags(parentProduct.product_id, wcProduct.id);
  
          // Handle categories same way as simple products
          if(wcProduct.categories) {
            for(const category of wcProduct.categories) {
              await this.groupSync.setGroupSimple(parentProduct.product_id, category.name);
            }
          }
  
          // Handle non-variation attributes as features same way as simple products
          if (wcProduct.attributes) {
            for (const attr of wcProduct.attributes) {
              // Only process non-variable attributes with valid options
              if (!attr.variation && attr.name && attr.options && attr.options.length > 0) {
                const featureName = attr.name;
                const featureValue = attr.options[0];
                if (featureName && featureValue) {
                  await this.featureSync.setFeatureSimple(parentProduct.product_id, featureName, featureValue);
                }
              }
            }
          }
  
          // Handle variations
          const variations = wcProduct.variations || [];
          if (variations.length > 0) {
            for (const variationId of variations) {
              const variationResponse = await this.api.get(`products/${productId}/variations/${variationId}`);
              const variation = variationResponse.data as WooCommerceVariation;
  
              if (!variation) {
                console.warn(`No variation data for ID ${variationId}, skipping...`);
                continue;
              }
              //brand handling 
              let brand;
              if(wcProduct.brands && wcProduct.brands.length > 0) {
                //@ts-ignore
                brand = wcProduct.brands[0].name;
              }
              
              const variationJson: ProductJson = {
                externalId: variation.id,
                parentId: wcProduct.id,
                name: wcProduct.name || 'Unnamed Product',
                sku: variation.sku || `wc-${variation.id}`,
                parent_sku: wcProduct.sku || `wc-${wcProduct.id}`,
                is_parent: false,
                salesChannelId: this.salesChannel.id,
                //@ts-ignore
                brand: brand
              };
  
              const variationProduct = await prdct.getProductBySku(variationJson);
              if (variationProduct) {
                // Update variation product name if it exists
                await this.productService.updateOne(variationProduct.product_id, {
                  name: wcProduct.name || 'Unnamed Product'
                });
                
                // Set parent-child relationship
                await this.productService.updateOne(variationProduct.product_id, {
                  parent_product: parentProduct.product_id
                });
  
                await this.createSalesChannelProductIfNotExists(variation.id, variationProduct);
                await this.importProductStock(variation as WooCommerceProduct, variationProduct.product_id);
  
                // Handle variation attributes as attributes
                if (variation.attributes) {
                  for (const attr of variation.attributes) {
                    if (attr.name && attr.option) {
                      await this.attributeSync.setAttributeSimple(
                        variationProduct.product_id,
                        attr.name,
                        attr.option
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error syncing product downstream:', error);
      throw new Error(`Failed to sync product ${productId} from WooCommerce: ${errorMessage}`);
    }
  }

  /**
   * Syncs all products from WooCommerce to local system (downstream)
   */
  public async syncAllProductsDownstream(): Promise<void> {
    if (!this.salesChannel) {
      throw new Error('Sales channel is not defined');
    }

    try {
      // Import features only
      await this.featureSync.importFeatures(false);
      
      let page = 1;
      let hasMorePages = true;
      let totalProcessed = 0;
      let totalSkipped = 0;

      console.log('Starting batch sync process...');

      while (hasMorePages) {
        console.log(`\nProcessing page ${page}...`);
        
        const pageResponse = await this.api.get('products', {
          per_page: 100,
          page: page
        });

        const wcProducts = pageResponse.data as WooCommerceProduct[];
        const totalPages = parseInt(pageResponse.headers['x-wp-totalpages']) || 1;
        hasMorePages = page < totalPages;

        // Filter out existing products in batch
        const productsToSync = await this.filterExistingProducts(wcProducts);
        totalSkipped += (wcProducts.length - productsToSync.length);

        // Process products in smaller batches for parallel execution
        for (let i = 0; i < productsToSync.length; i += this.BATCH_SIZE) {
          const batch = productsToSync.slice(i, i + this.BATCH_SIZE);
          await this.processBatch(batch);
          totalProcessed += batch.length;

          console.log(`Progress: ${totalProcessed} processed, ${totalSkipped} skipped`);
        }

        page++;
      }

      console.log('\nSync completed successfully!');
      console.log(`Total products processed: ${totalProcessed}`);
      console.log(`Total products skipped: ${totalSkipped}`);
      console.log('Note: Skipped products already existed in the system');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in batch sync process:', error);
      throw new Error(errorMessage);
    }
  }
}
