import mysql from 'mysql';
import util from 'util';
import Log from '../model/Log';

class ExternalDataProvider {
  constructor(host,port,password,username,database) {
    this.connection = mysql.createConnection({
        host: host,
        port:port,
        user: username,
        password: password,
        database: database
    });
}
    async getCurrentStock(warehouse, product,attribute){
        let query = `SELECT physical_quantity from cos_stock WHERE id_warehouse = ${warehouse} AND id_product = ${product} AND id_attribute = ${attribute} ;`;
        let db = util.promisify(this.connection.query).bind(this.connection);
        let result = await db(query);
        Log.toFile("externalStockQuery.log","query: ",query);
        return result[0].physical_quantity;
    }
  async getPrestashopProduct(productId,attributeId){
    let query;
    if(attributeId != null && attributeId > 0){
     query =`SELECT 
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
     cp.id_product, cp.reference, cpl.name;
`
    }
    else{
      query = `select cp.reference as main_sku, cp.reference as parent_sku , cp.reference as sku ,cpl.name from
cos_product cp 
inner join cos_product_lang cpl on cp.id_product = cpl.id_product  and  cpl.id_lang =7 AND cpl.id_shop = 13
where cp.id_product =  ${productId};`
    }

    let db = util.promisify(this.connection.query).bind(this.connection);
    let result = await db(query);
    Log.toFile("externalQuery.log","query: ",query);
    return result
    
  }
  async getPrestashopOrder(orderId){
    let querry = `   SELECT 
  
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
    co.id_order;
   
 

  `;
    return new Promise((resolve, reject) => {
      this.connection.query(querry, (err, result) => {
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