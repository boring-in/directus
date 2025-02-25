import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

interface WooCommerceBrand {
    id: number;
    name: string;
    slug: string;
    description?: string;
}

interface WooCommerceAttribute {
    name: string;
    options?: string[];
}

export class BrandSync {
    private api: WooCommerceRestApi;
    private brandService: any;
    private manufacturerService: any;

    constructor(
        api: WooCommerceRestApi,
        ItemsService: any,
        schema: any
    ) {
        this.api = api;
        this.brandService = new ItemsService("brand", { schema });
        this.manufacturerService = new ItemsService("manufacturer", { schema });
    }

    /**
     * Gets or creates a manufacturer by name
     */
    private async getOrCreateManufacturer(name: string): Promise<number> {
        const existingManufacturer = await this.manufacturerService.readByQuery({
            filter: { name: { _eq: name } }
        });

        if (existingManufacturer && existingManufacturer.length > 0) {
            return existingManufacturer[0].id;
        }

        const newManufacturer = await this.manufacturerService.createOne({
            name: name
        });

        return newManufacturer;
    }

    /**
     * Gets or creates a brand by name and manufacturer
     */
    private async getOrCreateBrand(name: string, manufacturerId: number): Promise<number> {
        const existingBrand = await this.brandService.readByQuery({
            filter: {
                _and: [
                    { name: { _eq: name } },
                    { manufacturer: { _eq: manufacturerId } }
                ]
            }
        });

        if (existingBrand && existingBrand.length > 0) {
            return existingBrand[0].id;
        }

        const newBrand = await this.brandService.createOne({
            name: name,
            manufacturer: manufacturerId
        });

        return newBrand;
    }

    /**
     * Imports brands from WooCommerce
     * Note: WooCommerce doesn't have a built-in brands API, so we extract brand info from product attributes
     */
    async importBrands(): Promise<void> {
        try {
            let page = 1;
            let hasMorePages = true;

            // Map to track unique brand-manufacturer combinations
            const brandManufacturerMap = new Map<string, string>();

            while (hasMorePages) {
                const response = await this.api.get("products", {
                    per_page: 100,
                    page: page
                });

                const products = response.data;
                const totalPages = parseInt(response.headers['x-wp-totalpages']) || 1;
                hasMorePages = page < totalPages;

                // Extract brand and manufacturer info from product attributes
                for (const product of products) {
                    const attributes: WooCommerceAttribute[] = product.attributes || [];
                    const brandAttr = attributes.find((attr: WooCommerceAttribute) => 
                        attr.name.toLowerCase() === 'brand' || 
                        attr.name.toLowerCase() === 'manufacturer'
                    );

                    if (brandAttr?.options?.[0]) {
                        const brandName = brandAttr.options[0];
                        // Use brand name as manufacturer name if no separate manufacturer attribute
                        const manufacturerName = brandName;
                        
                        if (brandName && manufacturerName) {
                            brandManufacturerMap.set(brandName, manufacturerName);
                        }
                    }
                }

                page++;
            }

            // Create manufacturers and brands
            for (const [brandName, manufacturerName] of brandManufacturerMap) {
                const manufacturerId = await this.getOrCreateManufacturer(manufacturerName);
                await this.getOrCreateBrand(brandName, manufacturerId);
            }

        } catch (error) {
            console.error('Failed to import brands:', error);
            throw error;
        }
    }

    /**
     * Updates a product's brand based on WooCommerce data
     */
    async syncProductBrand(productId: string | number, wcProductId: string): Promise<void> {
        try {
            const wcProduct = await this.api.get(`products/${wcProductId}`);
            const attributes: WooCommerceAttribute[] = wcProduct.data.attributes || [];

            const brandAttr = attributes.find((attr: WooCommerceAttribute) => 
                attr.name.toLowerCase() === 'brand' || 
                attr.name.toLowerCase() === 'manufacturer'
            );

            if (brandAttr?.options?.[0]) {
                const brandName = brandAttr.options[0];
                if (brandName) {
                    const manufacturerName = brandName; // Use brand name as manufacturer if no separate manufacturer attribute
                    const manufacturerId = await this.getOrCreateManufacturer(manufacturerName);
                    const brandId = await this.getOrCreateBrand(brandName, manufacturerId);

                    // Update product's brand
                    await this.brandService.updateOne(productId, {
                        brand: brandId
                    });
                }
            }
        } catch (error) {
            console.error(`Failed to sync brand for product ${productId}:`, error);
            throw error;
        }
    }
}
