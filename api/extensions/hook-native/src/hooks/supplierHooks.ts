import { Action } from "@directus/constants";

/**
 * Interface for hook service configuration
 */
interface ServiceConfig {
  services: {
    ItemsService: any;
  };
  getSchema: () => Promise<any>;
}

/**
 * Interface for supplier product payload
 */
interface SupplierProductPayload {
  keys: number[];
  payload: {
    supplier_products?: {
      create: Array<{
        product: number;
      }>;
    };
  };
}

/**
 * Interface for warehouse product input
 */
interface WarehouseProductInput {
  warehouse: number;
  product: number;
  product_calculation_type?: number;
  transfer_only_full_package?: boolean;
}

/**
 * Interface for supplier product data
 */
interface SupplierProduct {
  delivery_term: string;
  product_price: Array<{
    id: number;
    price: number;
    quantity_in_package: number;
    package_MOQ: number;
    MOQ_delivery_time: number;
  }>;
}

/**
 * Interface for product data
 */
interface Product {
  child_products: number[];
  parent_product: number;

}

/**
 * Sets up supplier-related hooks for the application
 * @param param0 - Service configuration object containing services and schema getter
 * @returns Object containing hook definitions
 */
export const setupSupplierHooks = ({ services, getSchema }: ServiceConfig) => {
  const { ItemsService } = services;

  return {
    

    'supplier.items.update': {
      action: async (payload: SupplierProductPayload) => {
        if (payload.payload.supplier_products?.create) {
          const schema = await getSchema();
          const productService = new ItemsService('product', { schema });
          const supplierProductService = new ItemsService('supplier_products', { schema });
          const productPriceService = new ItemsService('product_price', { schema });
          const createdSupplierProducts = payload.payload.supplier_products.create;

          for (const supplierProduct of createdSupplierProducts) {
            const item = supplierProduct.product;
            const product = await productService.readOne(item, { fields: ["child_products"] }) as Product;

            // Only proceed if product has child products
            if (product?.child_products && product.child_products.length > 0) {
              const parentSupplierProducts = (await supplierProductService.readByQuery({
                filter: {
                  _and: [
                    { supplier: { _eq: payload.keys[0] } },
                    { product: { _eq: item } }
                  ]
                }
              }, { fields: ["product_price.*.*", "delivery_term"] })) as SupplierProduct[];

              // Ensure we have parent supplier products before proceeding
              if (parentSupplierProducts?.[0]) {
                const parentProduct = parentSupplierProducts[0];

                // Process each child product
                for (const childProductId of product.child_products) {
                  const newProduct = await supplierProductService.createOne({
                    supplier: payload.keys[0],
                    product: childProductId,
                    delivery_term: parentProduct.delivery_term
                  });

                  // Create price entries for the new product
                  if (parentProduct.product_price) {
                    for (const productPrice of parentProduct.product_price) {
                      const parentPrice = await productPriceService.readOne(productPrice);
                      await productPriceService.createOne({
                        supplier_products: newProduct,
                        price: parentPrice.price,
                        quantity_in_package: parentPrice.quantity_in_package,
                        package_MOQ: parentPrice.package_MOQ,
                        MOQ_delivery_time: parentPrice.MOQ_delivery_time
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    'warehouse_products.items.create': {
      filter: async (input: WarehouseProductInput): Promise<WarehouseProductInput> => {
        const schema = await getSchema();
        const stockService = new ItemsService("stock", { schema });
        const warehouseProductService = new ItemsService("warehouse_products", { schema });
        const existingStock = await stockService.readByQuery({
          filter: {
            _and: [
              { warehouse: { _eq: input.warehouse } },
              { product: { _eq: input.product } }
            ]
          }
        });

        if (existingStock.length === 0) {
          await stockService.createOne({
            warehouse: input.warehouse,
            product: input.product,
            onhand_quantity: 0,
            available_quantity: 0,
            ordered_quantity: 0,
            reserved_quantity: 0
          });
        }
        //check the product if it has parent product
        const productService = new ItemsService("product", { schema });
        const product = await productService.readOne(input.product, { fields: ["child_products","parent_product"] }) as Product;
        if(product?.parent_product != null){
          input.product_calculation_type = 0;
          //try and find already created warehouse parent product
          let parentWarehouseProduct = await warehouseProductService.readByQuery({filter:{_and:[{warehouse:{_eq:input.warehouse}},{product:{_eq:product.parent_product}}]}});
          //set transfer package setting from parent product if it exists
          if(parentWarehouseProduct[0]?.transfer_only_full_package != null){
            input.transfer_only_full_package = parentWarehouseProduct[0].transfer_only_full_package;
          }
        }
        return input;
      }
    }
  };
};
