import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { WooCommerceCategory, LocalGroup } from "./types";

export class GroupSync {
  private api: WooCommerceRestApi;
  private groupService: any;
  private salesChannelProductService: any;
  private productGroupService: any;

  constructor(
    api: WooCommerceRestApi,
    ItemsService: any,
    schema: any
  ) {
    this.api = api;
    this.groupService = new ItemsService("groups", { schema });
    this.salesChannelProductService = new ItemsService("sales_channel_products", { schema });
    this.productGroupService = new ItemsService("product_group", { schema });
  }

  /**
   * Simplified version of create Group , to be used during product import proccess
   */
  public async setGroupSimple(productId:string|number,groupName:string):Promise<void>{
    try {
      const existingGroup = await this.groupService.readByQuery({
        filter: { name: { _eq: groupName } }
      });
      let groupId;
      if (existingGroup && existingGroup.length > 0) {
        groupId = existingGroup[0].id;
      } else {
        groupId = await this.groupService.createOne({
          name: groupName
        });
      }
      await this.associateProductWithGroup(productId, groupId);
    } catch (error) {
      console.error(`Failed to create group ${groupName}:`, error);
      throw error;
    }
  }

  public async setProductToGroup(appProductId:number,groupId:number):Promise<void>{
    try {
      await this.associateProductWithGroup(appProductId, groupId);
    } catch (error) {
      console.error(`Failed to associate product ${appProductId} with group ${groupId}:`, error);
      throw error;
    }
  }





  /**
   * Creates or updates product-group associations
   */
  private async associateProductWithGroup(productId: string | number, groupId: string | number): Promise<void> {
    try {
      // Check if association already exists
      const existingAssociation = await this.productGroupService.readByQuery({
        filter: {
          _and: [
            { product: productId },
            { product_group: groupId }
          ]
        }
      });

      if (!existingAssociation || existingAssociation.length === 0) {
        await this.productGroupService.createOne({
          product: productId,
          product_group: groupId
        });
      }
    } catch (error) {
      console.error(`Failed to associate product ${productId} with group ${groupId}:`, error);
      throw error;
    }
  }

  /**
   * Imports all product categories from WooCommerce as groups
   */
  async importGroups(): Promise<void> {
    try {
      // Get all WooCommerce categories
      const response = await this.api.get("products/categories", {
        per_page: 100 // Maximum allowed by WooCommerce
      });
      const categories = response.data as WooCommerceCategory[];

      // First pass: Create/update all groups
      const categoryToGroupMap = new Map<number, string | number>();
      for (const category of categories) {
        const groupData: LocalGroup = {
          name: category.name,
          parent_group: null // Will be set in second pass
        };

        // Check if group already exists (by matching name)
        const existingGroup = await this.groupService.readByQuery({
          filter: { name: { _eq: category.name } }
        });

        let groupId;
        if (existingGroup && existingGroup.length > 0) {
          groupId = existingGroup[0].id;
          await this.groupService.updateOne(groupId, groupData);
        } else {
          groupId = await this.groupService.createOne(groupData);
        }

        categoryToGroupMap.set(category.id, groupId);
      }

      // Second pass: Set parent-child relationships
      for (const category of categories) {
        if (category.parent !== 0) {
          const groupId = categoryToGroupMap.get(category.id);
          const parentGroupId = categoryToGroupMap.get(category.parent);

          if (groupId && parentGroupId) {
            // Update group with parent reference
            await this.groupService.updateOne(groupId, {
              parent_group: parentGroupId
            });
          }
        }
      }

      // Third pass: Assign products to groups using junction table
      for (const category of categories) {
        const groupId = categoryToGroupMap.get(category.id);
        if (!groupId) continue;

        // Get products in this category from WooCommerce
        const productsResponse = await this.api.get("products", {
          category: category.id,
          per_page: 100
        });

        const wcProducts = productsResponse.data;

        // Get local product IDs from sales channel products and create associations
        for (const wcProduct of wcProducts) {
          const salesChannelProduct = await this.salesChannelProductService.readByQuery({
            filter: {
              sales_channel_product_id: wcProduct.id.toString()
            }
          });

          if (salesChannelProduct && salesChannelProduct.length > 0) {
            await this.associateProductWithGroup(salesChannelProduct[0].product, groupId);
          }
        }
      }

    } catch (error) {
      console.error('Failed to import WooCommerce categories:', error);
      throw error;
    }
  }

  /**
   * Imports a single category and its products from WooCommerce
   */
  async importGroupByCategory(categoryId: number): Promise<void> {
    try {
      // Get category details
      const response = await this.api.get(`products/categories/${categoryId}`);
      const category = response.data as WooCommerceCategory;

      // Create/update group
      const groupData: LocalGroup = {
        name: category.name
      };

      // Check if group exists
      const existingGroup = await this.groupService.readByQuery({
        filter: { name: { _eq: category.name } }
      });

      let groupId;
      if (existingGroup && existingGroup.length > 0) {
        groupId = existingGroup[0].id;
        await this.groupService.updateOne(groupId, groupData);
      } else {
        groupId = await this.groupService.createOne(groupData);
      }

      // Handle parent relationship if exists
      if (category.parent !== 0) {
        const parentResponse = await this.api.get(`products/categories/${category.parent}`);
        const parentCategory = parentResponse.data as WooCommerceCategory;

        // Create/get parent group first
        let parentGroupId;
        const parentGroup = await this.groupService.readByQuery({
          filter: { name: { _eq: parentCategory.name } }
        });

        if (parentGroup && parentGroup.length > 0) {
          parentGroupId = parentGroup[0].id;
        } else {
          parentGroupId = await this.groupService.createOne({
            name: parentCategory.name
          });
        }

        // Update child's parent reference
        await this.groupService.updateOne(groupId, {
          parent_group: parentGroupId
        });
      }

      // Get and assign products using junction table
      const productsResponse = await this.api.get("products", {
        category: categoryId,
        per_page: 100
      });

      const wcProducts = productsResponse.data;

      for (const wcProduct of wcProducts) {
        const salesChannelProduct = await this.salesChannelProductService.readByQuery({
          filter: {
            sales_channel_product_id: wcProduct.id.toString()
          }
        });

        if (salesChannelProduct && salesChannelProduct.length > 0) {
          await this.associateProductWithGroup(salesChannelProduct[0].product, groupId);
        }
      }

    } catch (error) {
      console.error(`Failed to import WooCommerce category ${categoryId}:`, error);
      throw error;
    }
  }
}
