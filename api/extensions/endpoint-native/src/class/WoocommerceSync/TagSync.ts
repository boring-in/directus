import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { WooCommerceTag } from "./types";

export class TagSync {
    private api: WooCommerceRestApi;
    private tagService: any;
    private productTagService: any;
    private salesChannelProductService: any;

    constructor(
        api: WooCommerceRestApi,
        ItemsService: any,
        schema: any
    ) {
        this.api = api;
        this.tagService = new ItemsService("tags", { schema });
        this.productTagService = new ItemsService("product_tags", { schema });
        this.salesChannelProductService = new ItemsService("sales_channel_products", { schema });
    }

    async importTags(): Promise<void> {
        try {
            const response = await this.api.get("products/tags", {
                per_page: 100
            });
            const tags = response.data as WooCommerceTag[];

            for (const tag of tags) {
                // Check if tag exists
                const existingTag = await this.tagService.readByQuery({
                    filter: { name: { _eq: tag.name } }
                });

                let tagId;
                if (existingTag && existingTag.length > 0) {
                    tagId = existingTag[0].id;
                } else {
                    tagId = await this.tagService.createOne({
                        name: tag.name
                    });
                }

                // Get products with this tag
                const productsResponse = await this.api.get("products", {
                    tag: tag.id,
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
                        // Check if product-tag relation exists
                        const existingRelation = await this.productTagService.readByQuery({
                            filter: {
                                _and: [
                                    { product: salesChannelProduct[0].product },
                                    { tags: tagId }
                                ]
                            }
                        });

                        if (!existingRelation || existingRelation.length === 0) {
                            await this.productTagService.createOne({
                                product: salesChannelProduct[0].product,
                                tags: tagId
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to import WooCommerce tags:', error);
            throw error;
        }
    }

    async syncProductTags(productId: string | number, wcProductId: string): Promise<void> {
        try {
            const wcProduct = await this.api.get(`products/${wcProductId}`);
            const wcTags = wcProduct.data.tags || [];

            // Get existing product tags
            const existingTags = await this.productTagService.readByQuery({
                filter: { product: productId }
            });

            // Remove existing tags
            for (const existingTag of existingTags) {
                await this.productTagService.deleteOne(existingTag.id);
            }

            // Add new tags
            for (const wcTag of wcTags) {
                let tagId;
                const existingTag = await this.tagService.readByQuery({
                    filter: { name: { _eq: wcTag.name } }
                });

                if (existingTag && existingTag.length > 0) {
                    tagId = existingTag[0].id;
                } else {
                    tagId = await this.tagService.createOne({
                        name: wcTag.name
                    });
                }

                await this.productTagService.createOne({
                    product: productId,
                    tags: tagId
                });
            }
        } catch (error) {
            console.error(`Failed to sync tags for product ${productId}:`, error);
            throw error;
        }
    }
}
