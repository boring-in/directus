import mysql from 'mysql';
import util from 'util';
import Log from './Log';

/**
 * Interface for MySQL connection configuration
 */
interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Interface for Prestashop product attributes
 */
interface ProductAttribute {
  name: string;
  slug: string;
  value: string;
}

/**
 * Interface for Prestashop product response
 */
interface PrestashopProduct {
  externalId?: string;
  parentId?: number;
  main_sku: string;
  parent_sku: string;
  sku: string;
  name: string;
  attributes?: string; // JSON string containing ProductAttribute[]
}

/**
 * Interface for Prestashop order product
 */
interface OrderProduct {
  id_product: number;
  id_product_attribute: number | null;
  name: string;
  quantity: number;
  tax_rate: number;
  total: number;
  warehouse: number;
  sku: string;
  parent_sku: string;
  attributes: ProductAttribute[];
}

/**
 * Interface for Prestashop order
 */
interface PrestashopOrder {
  id_order: number;
  id_shop: number;
  payment: string;
  total_products: number;
  shipping_tax: number;
  total_shipping: number;
  total_discounts: number;
  shipping_type: string;
  date_add: string;
  current_state: number;
  address1: string;
  address2: string;
  phone: string;
  phone_mobile: string;
  postcode: string;
  city: string;
  id_customer: number;
  customer_phone: string;
  firstname: string;
  lastname: string;
  email: string;
  iso_code: string;
  products: string; // JSON string containing OrderProduct[]
}

/**
 * External Data Provider class for handling Prestashop database operations
 */
class ExternalDataProvider {
  private connection: mysql.Connection;

  constructor(host: string, port: number, password: string, username: string, database: string) {
    this.connection = mysql.createConnection({
      host,
      port,
      user: username,
      password,
      database
    });
  }

  /**
   * Get current stock level for a product in a specific warehouse
   */
  async getCurrentStock(warehouse: number, product: number, attribute: number): Promise<number> {
    const query = `SELECT physical_quantity from cos_stock WHERE id_warehouse = ${warehouse} AND id_product = ${product} AND id_attribute = ${attribute} ;`;
    const db = util.promisify(this.connection.query).bind(this.connection);
    const result = await db(query) as { physical_quantity: number }[];
    Log.toFile("externalStockQuery.log", "query: ", query);
    
    if (!result[0]) {
      throw new Error('No stock record found');
    }
    
    return result[0].physical_quantity;
  }

  /**
   * Get Prestashop product details by product ID and attribute ID
   */
  async getPrestashopProduct(productId: number, attributeId: number | null): Promise<PrestashopProduct[]> {
    let query: string;
    
    if (attributeId != null && attributeId > 0) {
      query = `SELECT 
        CONCAT(cp.id_product,"_",cpa.id_product_attribute) AS externalId,
        cp.id_product AS parentId,
        cp.reference AS main_sku,
        cp.reference AS parent_sku,
        cpa.reference as sku,
        cpl.name,
        CONCAT(
            '{"attributes":[',
            GROUP_CONCAT(
                CONCAT(
                    '{"name":"', REPLACE(cagl.public_name, '"', '\\"'), 
                    '","slug":"',REPLACE(cagl.name, '"', '\\"'),
                    '","value":"', REPLACE(cal.name, '"', '\\"'), '"}'
                )
            ),
            ']}'
        ) AS attributes
    FROM 
        cos_product cp
    INNER JOIN 
        cos_product_lang cpl ON cp.id_product = cpl.id_product AND cpl.id_lang = 7 AND cpl.id_shop = 13
    INNER JOIN 
        cos_product_attribute cpa ON cp.id_product = cpa.id_product 
    INNER JOIN 
        cos_product_attribute_combination cpac ON cpac.id_product_attribute = cpa.id_product_attribute 
    INNER JOIN 
        cos_attribute ca ON ca.id_attribute = cpac.id_attribute 
    INNER JOIN 
        cos_attribute_group_lang cagl ON cagl.id_attribute_group = ca.id_attribute_group AND cagl.id_lang = 7
    INNER JOIN 
        cos_attribute_lang cal ON cal.id_attribute = ca.id_attribute AND cal.id_lang = 7
    WHERE 
        cp.id_product = ${productId} AND cpa.id_product_attribute = ${attributeId}
    GROUP BY 
        cp.id_product, cp.reference, cpl.name;`;
    } else {
      query = `select cp.reference as main_sku, cp.reference as parent_sku , cp.reference as sku ,cpl.name from
cos_product cp 
inner join cos_product_lang cpl on cp.id_product = cpl.id_product  and  cpl.id_lang =7 AND cpl.id_shop = 13
where cp.id_product =  ${productId};`;
    }

    const db = util.promisify(this.connection.query).bind(this.connection);
    const result = await db(query) as PrestashopProduct[];
    Log.toFile("externalQuery.log", "query: ", query);
    return result;
  }

  /**
   * Get Prestashop order details by order ID
   */
  async getPrestashopOrder(orderId: number): Promise<PrestashopOrder[]> {
    const query = `SELECT 
    co.id_order,
    co.id_shop,
    co.payment,
    co.total_products_wt as total_products,
    co.carrier_tax_rate as shipping_tax,
    co.total_shipping_tax_incl as total_shipping,
    co.total_discounts_tax_incl as total_discounts,
    cc4.name as shipping_type,
    co.date_add,
    co.current_state,
    ca2.address1,
    ca2.address2,
    ca2.phone,
    ca2.phone_mobile,
    ca2.postcode,
    ca2.city,
    cc2.id_customer,
    cc2.phone as customer_phone,
    cc2.firstname,
    cc2.lastname,
    cc2.email,
    cc3.iso_code,
    
    CONCAT(
        '[',
        GROUP_CONCAT(
             DISTINCT CONCAT(
                '{"id_product":', ccp.id_product, 
                ',"id_product_attribute":',IFNULL (ccp.id_product_attribute," "),
                ',"name":',  JSON_QUOTE(cpl.name), 
                ',"quantity":', cod.product_quantity,
                ',"tax_rate":', ct.rate ,
                ',"total":', cod.total_price_tax_incl,
                ',"warehouse":', cod.id_warehouse ,
                ',"sku":"', IFNULL (cpa.reference, " ") ,
                '","parent_sku":"', IFNULL (cp.reference," ") ,
                '","attributes":', 
                      IFNULL( (SELECT CONCAT(
                                        '[',
                                        GROUP_CONCAT(
                                            CONCAT(
                                                '{"name":"',IFNULL ( cagl.public_name," "), '",',
                                                  '"slug":"', IFNULL (cagl.name," "), '",',
                                                  '"value":"',IFNULL (cal.name," "), '"}'
                                            )
                                            SEPARATOR ','
                                        ),
                                        ']'
                                    ) 
                        FROM cos_product_attribute_combination cpac
                        LEFT JOIN cos_attribute ca ON ca.id_attribute = cpac.id_attribute 
                        LEFT JOIN cos_attribute_lang cal ON cal.id_attribute = cpac.id_attribute 
                        LEFT JOIN cos_attribute_group cag ON cag.id_attribute_group = ca.id_attribute_group 
                        LEFT JOIN cos_attribute_group_lang cagl ON cagl.id_attribute_group = cag.id_attribute_group   
                        WHERE cpac.id_product_attribute = ccp.id_product_attribute 
                        AND cal.id_lang = 7 
                        AND cagl.id_lang = 7
                        ),JSON_QUOTE("")),
                      '}'
            )
            SEPARATOR ','
        ),
        ']'
    ) AS products
 FROM
    cos_orders co
    LEFT JOIN cos_cart_product ccp ON ccp.id_cart = co.id_cart
    left JOIN cos_product_lang cpl ON ccp.id_product = cpl.id_product and cpl.id_lang = 7 AND cpl.id_shop = co.id_shop 
    left join cos_customer cc2 on co.id_customer = cc2.id_customer 
    left join cos_address ca2 on ca2.id_address = co.id_address_delivery 
    left join cos_country cc3 on cc3.id_country = ca2.id_country
    left join cos_order_detail cod on cod.id_order = co.id_order AND cod.product_id = ccp.id_product 
    left join cos_carrier cc4 on cc4.id_carrier = co.id_carrier 
    left join cos_product_attribute cpa on cpa.id_product_attribute = ccp.id_product_attribute  
    left join cos_product cp on cp.id_product = cod.product_id 
    left join cos_order_detail_tax codt on codt.id_order_detail = cod.id_order_detail 
    left join cos_tax ct on codt.id_tax = ct.id_tax 
 WHERE
    co.id_order = ${orderId}
 GROUP BY
    co.id_order, co.id_shop, co.current_state, co.id_customer
 ORDER BY
    co.id_order;`;

    return new Promise<PrestashopOrder[]>((resolve, reject) => {
      this.connection.query(query, (err: mysql.MysqlError | null, result: PrestashopOrder[]) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      });
      this.connection.end();
    });
  }
}

export default ExternalDataProvider;
