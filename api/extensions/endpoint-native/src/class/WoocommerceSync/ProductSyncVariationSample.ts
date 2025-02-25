import { ProductJson, SalesChannel, WooCommerceProduct, WooCommerceVariation } from "./types";
import Product from "../Product";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { AttributeSync } from "./AttributeSync";
import { FeatureSync } from "./FeatureSync";
import { GroupSync } from "./GroupSync";

/**
 * This is a sample file showing how to implement variable product import
 * The code between START COPY and END COPY markers should be used to replace
 * the commented variable product section in ProductSync.ts's syncProductDownstream method
 */

// Example class structure to show context - DO NOT COPY THIS PART
class ProductSyncExample {
  constructor(
    private api: WooCommerceRestApi,
    private salesChannel: SalesChannel,
    private ItemsService: any,
    private schema: any,
    private productService: any,
    private tagSync: any,
    private featureSync: FeatureSync,
    private groupSync: GroupSync
  ) {}

  async syncProductDownstream(productId: string): Promise<void> {
    const wcProductResponse = await this.api.get(`products/${productId}`);
    const wcProduct = wcProductResponse.data as WooCommerceProduct;
    const prdct = new Product(this.ItemsService, this.schema);

    if (wcProduct.type === 'simple') {
      // Simple product handling...
    }

    /* START COPY - Copy everything between START COPY and END COPY into ProductSync.ts */
    else if (wcProduct.type === 'variable') {
      const productJson: ProductJson = {
        externalId: wcProduct.id,
        parentId: wcProduct.id,
        name: wcProduct.name || 'Unnamed Product',
        sku: wcProduct.sku || `wc-${wcProduct.id}`,
        parent_sku: wcProduct.sku || `wc-${wcProduct.id}`,
        is_parent: true,
        //@ts-ignore
        brand: wcProduct.brands[0].name
      };

      const parentProduct = await prdct.getProductBySku(productJson);
      if (parentProduct) {
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

            const variationJson: ProductJson = {
              externalId: variation.id,
              parentId: wcProduct.id,
              name: wcProduct.name || 'Unnamed Product',
              sku: variation.sku || `wc-${variation.id}`,
              parent_sku: wcProduct.sku || `wc-${wcProduct.id}`,
              is_parent: false,
              //@ts-ignore
              brand: wcProduct.brands[0].name
            };

            const variationProduct = await prdct.getProductBySku(variationJson);
            if (variationProduct) {
              // Set parent-child relationship
              await this.productService.updateOne(variationProduct.product_id, {
                parent_product: parentProduct.product_id
              });

              await this.createSalesChannelProductIfNotExists(variation.id, variationProduct);
              await this.importProductStock(variation as WooCommerceProduct, variationProduct.product_id);

              // Handle variation attributes as features
              if (variation.attributes) {
                for (const attr of variation.attributes) {
                  if (attr.name && attr.option) {
                    await this.featureSync.setFeatureSimple(
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
    /* END COPY */
  }

  // Example method stubs to show context - DO NOT COPY THIS PART
  private async createSalesChannelProductIfNotExists(id: string, product: any): Promise<void> {}
  private async importProductStock(product: WooCommerceProduct, id: string): Promise<void> {}
}

/**
 * Usage Notes:
 * 1. Copy only the code between START COPY and END COPY markers
 * 2. Paste it into ProductSync.ts's syncProductDownstream method
 * 3. Replace the existing commented variable product section
 * 
 * The implementation handles variable products similar to simple products:
 * - Uses setGroupSimple for categories
 * - Uses setFeatureSimple for both regular attributes and variation attributes
 * - Maintains parent-child relationships for variations
 * - Handles stock at variation level
 */
