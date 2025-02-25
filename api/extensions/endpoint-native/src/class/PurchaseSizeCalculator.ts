
import Warehouse from './Warehouse';
import Supplier from './Supplier';
import DataProvider from './DataProvider';
import DataWriter from './DataWriter';


import Log from './Log';

import ProductsForecast from './ProductsForecast';

/**
 * Interface representing the inner product data structure
 */
interface InnerProductData {
  use_default_value: boolean;
  warehouse: number;
  attribute_config_data: {
    attribute_config_id: number;
    moq: number;
    delivery_time: number;
  };
  product_id: number;
  supplier_product_id: number;
  name: string;
  parent_product: number;
  delivery_term: number;
  is_parent: number;
  ordered_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  onhand_quantity: number;
  wh_moq: number;
  product_calculation_type: number;
  buffer: number;
  analysed_period: number;
 // order_count_trough_ap: number;
  transfer_only_full_package: boolean;
  attribute_value_id: number;
  parent_type: string;
  parent_analized_period: number;
  parent_order_count: number;
  parent_buffer: number;
  parent_wh_moq: number;
  attribute_config_group: number;
  childs: any[];
  price: number;
  moq: number;
  supplier_parent_moq: number;
  attribute_config_moq: number;
  attribute_config_delivery_time: number;
  days_in_stock: number;
  sales: number;
  quantity_in_package?: number;
  parent_quantity_in_package?: number;
  parent_price?: number;
  total_variant_order_quantity?: number;
  attribute_values?: string;
  first_order_arrival_days?: number;
  second_order_arrival_days?: number;
}

/**
 * Interface representing product group data
 */
interface ProductGroupData {
  moq: number;
  delivery_term: number;
  first_order_arrival_days: number;
  second_order_arrival_days: number;
  products: Map<number, InnerProductData>;
  individualProductsCount?: number;
  finalOrderQuantity?: number;
}

/**
 * Class representing warehouse products data structure
 */
class WarehouseProductsData {
  parentProductsArray: Map<number, ProductGroupData>;
  attributeConfigGroupArray: Map<number, ProductGroupData>;
  individualProductArray: Map<number, InnerProductData>;
  purchaseData: Map<number, InnerProductData>;

  constructor() {
    this.parentProductsArray = new Map();
    this.attributeConfigGroupArray = new Map();
    this.individualProductArray = new Map();
    this.purchaseData = new Map();
  }
}

/**
 * Class responsible for calculating purchase sizes for suppliers and warehouses
 */
class PurchaseSizeCalculator {
  /**
   * Calculates the purchase size for a given supplier and warehouse
   */
  async calculatePurchaseSize(
    supplierId: number,
    warehouseId: number,
    purchaseId: number | null,
    context: any
  ): Promise<void> {
    const dataWriter = new DataWriter(context);
    const dataProvider = new DataProvider(context);
    const database = context.database;
    const { ItemsService } = context.services;
    const schema = await context.getSchema();
    
    // Create service instances with string collection names
    const productService = new ItemsService('product', { schema: schema });
    const supplierService = new ItemsService('supplier', { schema: schema });
    const supplierProductsService = new ItemsService('supplier_products', { schema: schema });

    const warehouse = new Warehouse(warehouseId);
    const currentDate = new Date();
    const timeCache: number[][] = [];

    await warehouse.load(context);
    const supplier = new Supplier(supplierId);
    await supplier.load(context);
    let warehouseMap = new Map<number, WarehouseProductsData>();

   
    const analizedPeriods = await dataProvider.getAnalyzedPeriods(warehouseId);
    const warehouseHierarchyData = await dataProvider.getWarehouseHierarchy(warehouseId);
    const warehouseHierarchy = warehouseHierarchyData.hierarchy;
    const allWarehouseInHierarchy = [...warehouseHierarchyData.warehouses, warehouseId];
    const envValues = await dataProvider.getEnvValues();

    // Process arriving products taking arrival date into account
    const arrivingProducts = await dataProvider.getArrivingProducts(warehouseId);
    Log.toCsv("arrivingProducts", arrivingProducts, true);

    /**
     * Initialize arriving products map
     */
    function arrivingProductsInit(arrivingProducts: any[]): Map<number, Map<number, number>> {
      const arrivingProductsMap = new Map<number, Map<number, number>>();
      arrivingProducts.forEach((product) => {
        const arrivalDate = new Date(product.arrival_date);
        const arrivalDays = getDaysBetweenDates(currentDate, arrivalDate);
        if (arrivingProductsMap.has(product.product_id)) {
          const productMap = arrivingProductsMap.get(product.product_id)!;
          if (productMap.has(arrivalDays)) {
            const quantity = productMap.get(arrivalDays)!;
            productMap.set(arrivalDays, quantity + product.arriving_quantity);
          } else {
            productMap.set(arrivalDays, product.arriving_quantity);
          }
        } else {
          const productMap = new Map<number, number>();
          productMap.set(arrivalDays, product.arriving_quantity);
          arrivingProductsMap.set(product.product, productMap);
        }
      });
      console.log(arrivingProductsMap);
      return arrivingProductsMap;
    }

    const arrivingProductsMap = arrivingProductsInit(arrivingProducts);

    const productForecast = new ProductsForecast(
      warehouseHierarchy,
      arrivingProductsMap,
      context,
      supplier
    );

    for (let i = 0; i < analizedPeriods.length; i++) {
      const period = analizedPeriods[i].analysed_period == null
        ? envValues.transfer_calculations_timespan
        : analizedPeriods[i].analysed_period;
      const useEnv = analizedPeriods[i].analysed_period == null;
      
      const dataForSorting = await dataProvider.getProductsForSupplyCalculation(
        supplierId,
        warehouseId,
        allWarehouseInHierarchy,
        period,
        true,
        useEnv
      );
      
      Log.toFile("", "dataForSortingByPeriods", dataForSorting);
      await productForecast.loadData(dataForSorting);
    }

    Log.toFile("", "after first Sorting loop", warehouseMap);
    warehouseMap = await productForecast.execute();
    Log.toFile("", "after second Sorting loop", warehouseMap);
    Log.toFile("", "warehouseMapAfter", warehouseMap);

    await writeOrder(warehouseMap.get(Number(warehouseId)), purchaseId);

    /**
     * Calculate days between two dates
     */
    function getDaysBetweenDates(date1: Date, date2: Date): number {
      const date1Ms = date1.getTime();
      const date2Ms = date2.getTime();
      const differenceMs = Math.abs(date2Ms - date1Ms);
      return Math.ceil(differenceMs / (1000 * 60 * 60 * 24));
    }

    /**
     * Write order to database
     */
    async function writeOrder(calculatedData: WarehouseProductsData | undefined, purchaseId: number | null): Promise<void> {
      if (!calculatedData) return;

      const purchaseData = calculatedData.purchaseData;
      const purchaseOrder = purchaseId == null
        ? await dataWriter.writeData("purchase", {
            warehouse: warehouseId,
            supplier: supplierId,
            status: 1,
            order_date: currentDate,
          })
        : purchaseId;

      purchaseData.forEach(async (item) => {
        const attributes = item.attribute_values == null 
          ? {} 
          : convertStringToJson(item.attribute_values);

        const purchaseProductService = new ItemsService("purchase_products", { schema });
        const firstOrderArrivalDate = new Date(currentDate);
        firstOrderArrivalDate.setDate(currentDate.getDate() + (item.first_order_arrival_days || 0));

        let itemQuantity = item.total_variant_order_quantity || 0;
        let itemPackages = 0;
        const itemQuantityInPackage = item.quantity_in_package == null 
          ? item.parent_quantity_in_package 
          : item.quantity_in_package;

        if (itemQuantityInPackage != null) {
          itemPackages = Math.ceil(itemQuantity / itemQuantityInPackage);
          itemQuantity = itemPackages * itemQuantityInPackage;
        }

        const itemPackagePrice = item.price == null ? item.parent_price : item.price;
        const itemTotalPrice = Number((itemPackagePrice! * itemPackages).toFixed(2));
        const itemUnitPrice = itemTotalPrice / itemQuantity;

        Log.toCsv("order", item, true);
        
        if (item.total_variant_order_quantity! > 0) {
          await purchaseProductService.createOne({
            product: item.supplier_product_id,
            quantity: itemQuantity,
            packages: itemPackages,
            purchase: purchaseOrder,
            arrival_date: firstOrderArrivalDate,
            unit_price: itemUnitPrice,
            full_price: itemTotalPrice,
            attributes: attributes,
          });
        }
      });
    }

    /**
     * Convert string to JSON object
     */
    function convertStringToJson(inputString: string): Record<string, string | number> {
      const pairs = inputString.split(",");
      const result: Record<string, string | number> = {};

      pairs.forEach((pair) => {
        const [key, value] = pair.split(":");
        result[key.trim()] = isNaN(Number(value)) ? value.trim() : parseFloat(value);
      });

      return result;
    }
  }
}

export default PurchaseSizeCalculator;
