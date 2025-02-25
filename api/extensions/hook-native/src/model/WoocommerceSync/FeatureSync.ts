import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

import { WPTaxonomy } from "./types";

interface WooCommerceAttribute {
  id: number;
  name: string;
  slug: string;
  type: string;
  order_by: string;
  has_archives: boolean;
  variation: boolean;
}

interface WooCommerceTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

export class FeatureSync {
  private api: WooCommerceRestApi;
  private featureService: any;
  private featureValueService: any;
  private featureValueProductService: any;
  private lastImportTime: number = 0;
  private featureCache: Map<string, any> = new Map();
  private featureValueCache: Map<string, any> = new Map();
  private readonly CACHE_DURATION = 3600000; // 1 hour in milliseconds

  constructor(api: WooCommerceRestApi, ItemsService: any, schema: any) {
    this.api = api;
    this.featureService = new ItemsService("features", { schema });
    this.featureValueService = new ItemsService("feature_value", { schema });
    this.featureValueProductService = new ItemsService("feature_value_product", { schema });
  }

  /** 
   *  Set feature to product simplified version
   */
  public async setFeatureSimple(productId: string | number, featureName: string, value: string, reference?: string): Promise<void> {
    try {
      const feature = await this.createFeature(featureName, reference);
      if (!feature) {
        throw new Error(`Failed to create/get feature "${featureName}"`);
      }
      const featureValue = await this.createFeatureValue(feature.id, value, reference);
      await this.mapFeatureToProduct(featureName, value, productId, reference);
    } catch (error) {
      console.error(`Failed to map feature "${featureName}" to product ${productId}:`, error);
      throw error;
    }
  }




  /**
   * Creates a feature in the local system
   */
  private async createFeature(name: string, reference?: string): Promise<{ id: number, name: string } | null> {
    try {
      if (!name) {
        console.warn("Attempted to create feature with empty name");
        return null;
      }

      // First try to find by reference if provided
      let existingFeature = null;
      if (reference) {
        existingFeature = await this.featureService.readByQuery({
          filter: { reference: { _eq: reference } },
          sort: ['id']
        });
      }

      // If not found by reference, try by name
      if (!existingFeature || existingFeature.length === 0) {
        existingFeature = await this.featureService.readByQuery({
          filter: { name: { _eq: name } },
          sort: ['id']
        });
      }

      if (existingFeature && existingFeature.length > 0) {
        console.log(`Feature "${name}" already exists, skipping creation`);
        return existingFeature[0];
      }

      const newFeature = await this.featureService.createOne({
        name: name,
        reference: reference
      });
      const finalFeature = {id: newFeature, name: name};
      console.log(`Created new feature "${name}" with ID ${finalFeature.id}`);
      return finalFeature;
    } catch (error) {
      console.error(`Failed to create feature ${name}:`, error);
      throw error;
    }
  }

  /**
   * Creates feature value for a given feature simplified version
   */
  private async createFeatureValue(featureId: number | undefined, value: string, reference?: string): Promise<{ id: number, value: string } | null> {
    let finalFeatureValue;
    try {
      // First try to find by reference if provided
      let existingFeatureValue = null;
      if (reference) {
        existingFeatureValue = await this.featureValueService.readByQuery({
          filter: {
            _and: [
              { feature: { _eq: featureId } },
              { reference: { _eq: reference } }
            ]
          },
          sort: ['id']
        });
      }

      // If not found by reference or no reference provided, try by value
      if (!existingFeatureValue || existingFeatureValue.length === 0) {
        existingFeatureValue = await this.featureValueService.readByQuery({
          filter: {
            _and: [
              { feature: { _eq: featureId } },
              { value: { _eq: value } }
            ]
          },
          sort: ['id']
        });
      }
      if (existingFeatureValue && existingFeatureValue.length > 0) {
        console.log(`Feature value "${value}" already exists for feature ${featureId}, skipping`);
        finalFeatureValue = existingFeatureValue[0];
        return finalFeatureValue;
      }
      else{
        const newValue = await this.featureValueService.createOne({
          feature: featureId,
          value: value,
          reference: reference
        });
        finalFeatureValue = {id: newValue, value: value};
        console.log(`Created new feature value "${value}" for feature ${featureId}`);
        return finalFeatureValue;
      }
    }
    catch (error) {
      console.error(`Failed to create feature value for feature ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Creates feature values for a given feature
   */
  private async createFeatureValues(featureId: number | undefined, terms: WooCommerceTerm[]): Promise<void> {
    try {
      if (!featureId) {
        throw new Error("Feature ID is required to create feature values");
        throw new Error("Feature ID is required to create feature values");
      }

      if (!Array.isArray(terms)) {
        console.warn("No terms provided for feature values");
        return;
      }

      for (const term of terms) {
        if (!term.name) {
          console.warn("Skipping term with empty name");
          continue;
        }

        const existingValue = await this.featureValueService.readByQuery({
          filter: {
            _and: [
              { feature: { _eq: featureId } },
              { value: { _eq: term.name } }
            ]
          },
          sort: ['id']
        });

        if (!existingValue || existingValue.length === 0) {
          const newValue = await this.featureValueService.createOne({
            feature: featureId,
            value: term.name,
            reference: term.slug // Store term slug as reference
          });
          console.log(`Created new feature value "${term.name}" (${term.slug}) for feature ${featureId}`);
        } else {
          console.log(`Feature value "${term.name}" already exists for feature ${featureId}, skipping`);
        }
      }
    } catch (error) {
      console.error(`Failed to create feature values for feature ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Imports product taxonomies as features
   */
  /**
   * Gets product taxonomies from WordPress
   */
  public async getProductTaxonomies(): Promise<WPTaxonomy[]> {
    try {
      const wpUrl = this.api.url.replace(/\/wp-json\/.*$/, '');
      const taxonomiesResponse = await fetch(`${wpUrl}/wp-json/wp/v2/taxonomies`);
      const taxonomiesData = await taxonomiesResponse.json() as Record<string, WPTaxonomy>;

      if (!taxonomiesData) {
        console.warn("No taxonomies found in WordPress");
        return [];
      }

      // Filter taxonomies that have "product" in their types array
      return Object.values(taxonomiesData).filter(
        taxonomy => taxonomy.types.includes("product")
      );
    } catch (error) {
      console.error("Failed to get product taxonomies:", error);
      return [];
    }
  }

  private async importTaxonomies(): Promise<void> {
    try {
      console.log("Fetching product taxonomies...");
      
      const wpUrl = this.api.url.replace(/\/wp-json\/.*$/, '');
      const taxonomiesResponse = await fetch(`${wpUrl}/wp-json/wp/v2/taxonomies`);
      const taxonomiesData = await taxonomiesResponse.json();

      if (!taxonomiesData) {
        console.warn("No taxonomies found in WordPress");
        return;
      }

      const taxonomies = taxonomiesData as Record<string, WPTaxonomy>;
      console.log(`Found ${Object.keys(taxonomies).length} taxonomies`);

      // Filter taxonomies that have "product" in their types array
      const productTaxonomies = Object.values(taxonomies).filter(
        (taxonomy: WPTaxonomy) => taxonomy.types.includes("product")
      );

      console.log(`Found ${productTaxonomies.length} product taxonomies`);

      for (const taxonomy of productTaxonomies) {
        if (taxonomy.name) {
          console.log(`Processing taxonomy: ${taxonomy.name}`);
          const feature = await this.createFeature(taxonomy.name, taxonomy.slug);
          
          if (!feature || !feature.id) {
            console.warn(`Failed to create/get feature for taxonomy ${taxonomy.name}`);
            continue;
          }

          // Get terms for this taxonomy using its rest_base (for API endpoint)
          const termsResponse = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomy.rest_base}`);
          const termsData = await termsResponse.json();

          if (!termsData) {
            console.warn(`No terms found for taxonomy ${taxonomy.name}`);
            continue;
          }

          const terms = termsData as WooCommerceTerm[];
          console.log(`Found ${terms.length} terms for taxonomy ${taxonomy.name}`);
          
          await this.createFeatureValues(feature.id, terms);
        }
      }
    } catch (error) {
      console.error("Failed to import categories:", error);
      throw error;
    }
  }

  /**
   * Gets all attributes that are used as variations in variable products
   */
  // feature import change
  public async getVariationAttributes(): Promise<Set<number>> {
    const variationAttributeIds = new Set<number>();

    try {
      // Get variable products
      const variableProductsResponse = await this.api.get("products", {
        per_page: 100,
        type: "variable"
      });

      if (!variableProductsResponse.data) {
        return variationAttributeIds;
      }

      const variableProducts = variableProductsResponse.data;

      // For each variable product, collect its variation attributes
      for (const product of variableProducts) {
        if (product.attributes) {
          for (const attr of product.attributes) {
            if (attr.variation && attr.id) {
              variationAttributeIds.add(attr.id);
            }
          }
        }
      }

      return variationAttributeIds;
    } catch (error) {
      console.error("Failed to get variation attributes:", error);
      return variationAttributeIds;
    }
  }

  /**
   * Imports non-variation attributes as features
   */
  private async importAttributes(): Promise<void> {
    try {
      console.log("Fetching product attributes...");
      
      // Get all attributes first
      const attributesResponse = await this.api.get("products/attributes");

      if (!attributesResponse.data) {
        console.warn("No attributes found in WooCommerce");
        return;
      }

      const attributes = attributesResponse.data as WooCommerceAttribute[];
      console.log(`Found ${attributes.length} total attributes`);

      // Get attributes used as variations
      const variationAttributeIds = await this.getVariationAttributes();
      console.log(`Found ${variationAttributeIds.size} variation attributes`);

      // Filter attributes that are not used as variations
      const nonVariationAttributes = attributes.filter(attr => 
        !variationAttributeIds.has(attr.id) && attr.name
      );

      console.log(`Processing ${nonVariationAttributes.length} non-variation attributes`);

      for (const attr of nonVariationAttributes) {
        console.log(`Processing attribute: ${attr.name}`);
        const feature = await this.createFeature(attr.name, attr.slug);

        if (!feature || !feature.id) {
          console.warn(`Failed to create/get feature for attribute ${attr.name}`);
          continue;
        }

        const termsResponse = await this.api.get(`products/attributes/${attr.id}/terms`);

        if (!termsResponse.data) {
          console.warn(`No terms found for attribute ${attr.name}`);
          continue;
        }

        const terms = termsResponse.data as WooCommerceTerm[];
        console.log(`Found ${terms.length} terms for attribute ${attr.name}`);

        await this.createFeatureValues(feature.id, terms);
      }
    } catch (error) {
      console.error("Failed to import attributes:", error);
      throw error;
    }
  }

  /**
   * Check if features need to be reimported based on cache duration
   */
  private shouldReimportFeatures(): boolean {
    const currentTime = Date.now();
    return currentTime - this.lastImportTime > this.CACHE_DURATION;
  }

  /**
   * Get feature from cache or database
   */
  private async getFeatureFromCache(name: string, reference?: string): Promise<any> {
    const cacheKey = reference ? `feature_ref_${reference}` : `feature_name_${name}`;
    if (this.featureCache.has(cacheKey)) {
      return this.featureCache.get(cacheKey);
    }

    let feature = null;
    
    // First try to find by reference if provided
    if (reference) {
      feature = await this.featureService.readByQuery({
        filter: { reference: { _eq: reference } },
        sort: ['id']
      });
    }

    // If not found by reference or no reference provided, try by name
    if (!feature || feature.length === 0) {
      feature = await this.featureService.readByQuery({
        filter: { name: { _eq: name } },
        sort: ['id']
      });
    }

    if (feature && feature.length > 0) {
      this.featureCache.set(cacheKey, feature[0]);
      return feature[0];
    }

    return null;
  }

  /**
   * Get feature value from cache or database
   */
  private async getFeatureValueFromCache(featureId: number, value: string, reference?: string): Promise<any> {
    const cacheKey = reference ? `feature_value_ref_${featureId}_${reference}` : `feature_value_${featureId}_${value}`;
    if (this.featureValueCache.has(cacheKey)) {
      return this.featureValueCache.get(cacheKey);
    }

    let featureValue = null;

    // First try to find by reference if provided
    if (reference) {
      featureValue = await this.featureValueService.readByQuery({
        filter: {
          _and: [
            { feature: { _eq: featureId } },
            { reference: { _eq: reference } }
          ]
        },
        sort: ['id']
      });
    }

    // If not found by reference or no reference provided, try by value
    if (!featureValue || featureValue.length === 0) {
      featureValue = await this.featureValueService.readByQuery({
        filter: {
          _and: [
            { feature: { _eq: featureId } },
            { value: { _eq: value } }
          ]
        },
        sort: ['id']
      });
    }

    if (featureValue && featureValue.length > 0) {
      this.featureValueCache.set(cacheKey, featureValue[0]);
      return featureValue[0];
    }

    return null;
  }

  /**
   * Clear the feature caches
   */
  private clearCaches(): void {
    this.featureCache.clear();
    this.featureValueCache.clear();
  }

  /**
   * Imports all features from WooCommerce (both categories and non-variation attributes)
   */
  async mapFeatureToProduct(featureName: string, value: string, productId: string | number, reference?: string): Promise<void> {
    try {
      let feature = null;
      
      // First try to find by reference if provided
      if (reference) {
        feature = await this.featureService.readByQuery({
          filter: { reference: { _eq: reference } },
          sort: ['id']
        });
      }

      // If not found by reference, try by name
      if (!feature || !feature.length) {
        feature = await this.featureService.readByQuery({
          filter: { name: { _eq: featureName } },
          sort: ['id']
        });
      }

      if (!feature || !feature.length) {
        console.log(`Feature "${featureName}" not found with ${reference ? `reference "${reference}" or ` : ''}name, skipping mapping`);
        return;
      }

      // Try to find feature value by reference first, then by value
      let featureValue = null;
      if (reference) {
        featureValue = await this.featureValueService.readByQuery({
          filter: {
            _and: [
              { feature: { _eq: feature[0].id } },
              { reference: { _eq: reference } }
            ]
          },
          sort: ['id']
        });
      }

      if (!featureValue || featureValue.length === 0) {
        featureValue = await this.featureValueService.readByQuery({
          filter: {
            _and: [
              { feature: { _eq: feature[0].id } },
              { value: { _eq: value } }
            ]
          },
          sort: ['id']
        });
      }

      if (!featureValue || featureValue.length === 0) {
        // Create new feature value
        const newFeatureValueId = await this.featureValueService.createOne({
          feature: feature[0].id,
          value: value,
          reference: reference
        });
        featureValue = [{
          id: newFeatureValueId,
          value: value
        }];
      }

      // Check if mapping already exists
      const existingMapping = await this.featureValueProductService.readByQuery({
        filter: {
          _and: [
            { feature_value_id: { _eq: featureValue[0].id } },
            { product_product_id: { _eq: productId } }
          ]
        },
        sort: ['id']
      });


      await this.featureValueProductService.createOne({
        feature_value_id: featureValue[0].id,
        product_product_id: typeof productId === 'string' ? parseInt(productId, 10) : productId
      });

      console.log(`Mapped feature "${featureName}" with value "${value}" to product ${productId}`);
    } catch (error) {
      console.error(`Failed to map feature "${featureName}" to product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Force reimport of all features
   */
  async forceImportFeatures(): Promise<void> {
    await this.importFeatures(true);
  }

  /**
   * Imports all features from WooCommerce with caching
   */
  async importFeatures(force: boolean = false): Promise<void> {
    try {
      if (!force && !this.shouldReimportFeatures()) {
        console.log("Using cached features, skipping import");
        return;
      }

      console.log("Starting feature import...");
      this.clearCaches();
      
      console.log("Importing taxonomies as features...");
      await this.importTaxonomies();
      
      console.log("Importing non-variation attributes as features...");
      await this.importAttributes();
      
      this.lastImportTime = Date.now();
      console.log("Feature import completed successfully");
    } catch (error) {
      console.error("Feature import failed:", error);
      throw error;
    }
  }
}









