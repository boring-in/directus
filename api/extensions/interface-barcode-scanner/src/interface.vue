<template>
	<div>
		<div class="scanner-container">
			<v-input 
				id="barcode" 
				v-model="bar" 
				:value="bar" 
				v-on:keyup.enter="findBarcode(bar)"
				class="scanner-input"
			/>
			<v-button 
				@click="showOption(), findBarcode(bar)"
				class="find-button secondary"
			>Find Product</v-button>
		</div>
		
		<table class="product_table">
			<tr class="product_line_header">
				<th class="product_name_header">Product Name</th>
				<th class="product_name_header">Attributes</th>
				<th v-if="show_onhand" class="product_quantity_header">Onhand</th>
				<th v-if="show_reserved" class="product_quantity_header">Reserved</th>
				<th v-if="show_ordered" class="product_quantity_header">Ordered</th>
				<th v-if="show_available" class="product_quantity_header">Available</th>
				<!-- <th v-if="this.mode==`purchase`" class="product_quantity_header">Available in other stocks</th>  -->
				<th v-if="this.mode != `taking`" class="product_quantity_header">Packages</th>
				<th v-if="this.mode == `receiving` || this.mode == `purchase`" class="product_price_header package-price-col">Package Price</th>
				<th class="product_price_header units-col">Units</th>
				<th v-if="this.mode == `receiving`|| this.mode == `purchase`" class="product_price_header">Unit Price</th>
				<th v-if="this.mode == `receiving`|| this.mode == `purchase`" class="product_price_header">Full Price</th>
				<th v-if="this.mode==`purchase`" class="product_price_header">Order Arrival Date</th>
				<th></th>
			</tr>
		
			<tr 
				class="product_list_item" 
				v-for="(product,index) in products.slice().reverse()" 
				:key="index"
			>
				<td class="product_name">{{product.product}}</td>
				<td class="attributes_cell">
					<div v-for="(value, key) in JSON.parse(product.attributes || '{}')" :key="key" class="attribute_line">
						<span class="attribute_name">{{key}}</span>
						<span class="attribute_separator">-</span>
						<span class="attribute_value">{{value}}</span>
					</div>
				</td>
				<td v-if="show_onhand" class="product_name">{{product.onhand}}</td>
				<td v-if="show_reserved" class="product_name">{{product.reserved}}</td>
				<td v-if="show_ordered" class="product_name">{{product.ordered}}</td>
				<td v-if="show_available" class="product_name">{{product.available}}</td>
				<!-- <td v-if="this.mode==`purchase`" class="product_name">{{product.rest_available}}</td>
				 -->
				<td v-if="this.mode == `receiving` || this.mode==`purchase`" class="product_quantity">
					<v-input 
						id="quantity" 
						class="product_imput" 
						:min="0" 
						v-model="product.quantity"  
						@focus.native="$event.target.select()" 
						v-on:change="changeQuantity(product.quantity,index,-1)" 
						v-on:keyup.enter="focusPackagePrice(bar)"
					/>
				</td>
				<td v-if="this.mode == `receiving` || this.mode == `purchase`" class="product_price package-price-col">
					<v-input 
						id="package_price"  
						class="product_imput" 
						v-model="product.package_price"   
						@focus.native="$event.target.select()" 
						v-on:change="changePackagePrice(product.package_price,index)" 
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				<td v-if="this.mode == `transfer`" class="product_quantity">
					<v-input 
						id="quantity" 
						class="product_imput" 
						:min="0" 
						v-model="product.quantity"  
						@focus.native="$event.target.select()" 
						v-on:change="changeQuantity(product.quantity,index,-1)" 
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				<td v-if="this.mode == `write-off`" class="product_quantity">
					<v-input 
						id="quantity" 
						class="product_imput" 
						:min="0" 
						v-model="product.quantity"  
						@focus.native="$event.target.select()" 
						v-on:change="changeQuantity(product.quantity,index,product.onhand)" 
						v-on:keyup.enter="focusPrice(bar)"
					/>
				</td>

				<td v-if="this.mode == `receiving`|| this.mode==`purchase`" class="product_quantity">
					<v-input 
						id="units" 
						class="product_imput" 
						:min="0" 
						v-model="product.units"  
						@focus.native="$event.target.select()" 
						v-on:change="changeUnits(product.units,index)" 
						v-on:keyup.enter="focusPrice(bar)"
					/>
				</td>
				<td v-if="this.mode == `transfer`" class="product_quantity">
					<v-input 
						id="units" 
						class="product_imput" 
						:min="0" 
						v-model="product.units"  
						@focus.native="$event.target.select()" 
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				<td v-if="this.mode == `write-off`" class="product_quantity">
					<v-input 
						id="units" 
						class="product_imput" 
						:min="0" 
						v-model="product.units"  
						@focus.native="$event.target.select()"  
						v-on:keyup.enter="focusPrice(bar)"
					/>
				</td>
				<td v-if="this.mode == `taking`" class="product_quantity">
					<v-input 
						id="units" 
						class="product_imput" 
						:min="0" 
						v-model="product.units"
						@focus.native="$event.target.select()" 
						v-on:change="changeQuantity(product.units,index,-1)"
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				
				<td v-if="this.mode == `receiving`" class="product_price">
					<v-input 
						id="price"  
						class="product_imput" 
						v-model="product.unit_price"   
						@focus.native="$event.target.select()" 
						v-on:change="changePrice(product.unit_price,index)" 
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				<td v-if="this.mode == `purchase`" class="product_price">
					<v-input 
						id="price" 
						class="product_imput" 
						v-model="product.unit_price"  
						@focus.native="$event.target.select()" 
						v-on:change="changePrice(product.unit_price,index)"  
						v-on:keyup.enter="focusBarcode(bar)"
					/>
				</td>
				<td v-if="this.mode == `receiving`|| this.mode == `purchase`" class="product_name">
					{{(product.unit_price*product.units).toFixed(2)}}
				</td>
				<td v-if="this.mode==`purchase`" class="product_name">
					{{product.order_arrival_date}}
				</td>
				<td>
					<button class="remove_item" @click="removeItem(index)">
						<v-icon class="remove_icon" name="close" left></v-icon>
					</button>
				</td>
			</tr>
		</table>

		<!-- Barcode Not Found Modal -->
		<v-dialog v-model="barcodeNotFoundModalVisible" persistent max-width="290">
			<v-card>
				<v-card-title class="text-h5">
					Barcode Not Found
				</v-card-title>
				<v-card-text>
					The barcode {{ currentBarcode }} was not found in the system. 
					What would you like to do?
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn 
						color="grey darken-1" 
						text 
						@click="closeNotFoundModal"
					>
						Do Nothing
					</v-btn>
					<v-btn 
						color="primary" 
						@click="handleCreateBarcodeItem"
					>
						Create Barcode Item
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>


		<v-dialog v-model="barcodeCreationModalVisible" persistent max-width="290">
			<v-card>
				<v-card-title class="text-h5">
					Create Barcode Item
				</v-card-title>
				<v-card-text>
					<v-input 
						id="barcode" 
						v-model="currentBarcode" 
						:value="currentBarcode" 
						
					/>
				</v-card-text>
				<v-card-text>
					<v-input>
						<v-label>Product Name</v-label>
						<v-input v-model="productName" />
					</v-input>
				</v-card-text>
				<v-card-text>
					<v-input>
						<v-label>Units in Package</v-label>
						<v-input v-model="unitsInPackage" />
					</v-input>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn 
						color="grey darken-1" 
						text 
						@click="closeBarcodeCreationModal"
					>
						Cancel
					</v-btn>
					<v-btn 
						color="primary" 
						@click="closeBarcodeCreationModal"
					>
						Create
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script>
export default {
	props: {
		value: {
			type: [Object, Array],
			default: () => []
		},
		bar: {
			type: String,
			default: null
		},
		collection: {
			type: String
		},
		primaryKey: {
			type: String
		},
		price: {
			type: Boolean
		},
		mode: {
			type: String
		},
		show_onhand: {
			type: Boolean,
			default: false
		},
		show_reserved: {
			type: Boolean,
			default: false
		},
		show_ordered: {
			type: Boolean,
			default: false
		},
		show_available: {
			type: Boolean,
			default: false
		}
	},
	data() {
		return {
			products: [],
			currentBarcode: null,
			barcodeNotFoundModalVisible: false,
			barcodeCreationModalVisible: false,
		}
	},
	emits: ['input', 'create-barcode-item'],
	inject: ['api'],
	methods: {
		showOption: function() {
			let warehouse_id = sessionStorage.getItem('warehouse_id');
		},
		
		closeNotFoundModal() {
			this.barcodeNotFoundModalVisible = false;
			this.currentBarcode = null;
		},
		closeBarcodeCreationModal() {
			this.barcodeCreationModalVisible = false;
		},
		
		handleCreateBarcodeItem() {
			// Emit event to parent component to handle barcode item creation
			this.$emit('create-barcode-item', this.currentBarcode);
			this.closeNotFoundModal();
		},
		
		removeItem: function(index) {
			this.products.splice((this.products.length-index-1), 1);
			this.$emit("input", this.products);
		},
		
		changeQuantity: function(value, index, max) {
			if (value < 0) {
				value = 0;
			}
			if (max > (-1)) {
				if (value > max) {
					value = max;
				}
			}
			
			let realIndex = this.products.length - index - 1;
			let currentVal = this.products[realIndex];
			
			let newVal;
			if(this.mode == `taking`){
				newVal = {
					...currentVal,
					units: value
				};
			} else {
				newVal = {
					...currentVal,
					quantity: value,
					units: currentVal.units_in_package * value
				};
			}
			
			this.products[realIndex] = newVal;
			this.$emit("input", this.products);
		},
		
		changePrice: function(value, index) {
			if (value < 0) {
				value = 0;
			}
			
			let realIndex = this.products.length - index - 1;
			let currentVal = this.products[realIndex];
			let newVal = {
				...currentVal,
				unit_price: value,
				package_price: value * currentVal.units_in_package
			};
			
			this.products[realIndex] = newVal;
			this.$emit("input", this.products);
		},

		changePackagePrice: function(value, index) {
			if (value < 0) {
				value = 0;
			}
			
			let realIndex = this.products.length - index - 1;
			let currentVal = this.products[realIndex];
			let newVal = {
				...currentVal,
				package_price: value,
				unit_price: value / currentVal.units_in_package
			};
			
			this.products[realIndex] = newVal;
			this.$emit("input", this.products);
		},
		
		findBarcode: async function(value) {
			let item = null;
			let warehouse, supplier;
			
			if (this.primaryKey != "+") {
				item = await this.api.get(`items/${this.collection}/${this.primaryKey}?fields=*`);
				warehouse = item.data.data.warehouse;
				supplier = item.data.data.supplier == undefined ? null : item.data.data.supplier;
			} else {
				warehouse = sessionStorage.getItem('warehouse_id');
				supplier = sessionStorage.getItem('supplier_id');
			}
			
			let productBarcode = await this.api.get(`native/barcode/${value}/${warehouse}/${supplier}`);
			
			if (productBarcode.data.length > 0) {
				await this.processFoundBarcode(productBarcode.data[0],warehouse,supplier);
			} else {
				// Show barcode not found modal
				this.currentBarcode = value;
				this.barcodeNotFoundModalVisible = true;
			}
		},
		
		async processFoundBarcode(barcodeData,warehouse,supplier) {
			let stockOnhandQuantity = barcodeData.onhand_quantity;
			let stockReservedQuantity = barcodeData.reserved_quantity;
			let stockOrderedQuantity = barcodeData.ordered_quantity;
			let stockAvailableQuantity = barcodeData.available_quantity;
			
			let unitPrice = null;
			let restAvailable = 0;
			let orderArrivalDate = null;
			
			// Check if we already have this product in the list
			const existingProduct = this.products.find(p => p.product_id === barcodeData.product_id);
			if (existingProduct) {
				unitPrice = existingProduct.unit_price;
			}
			
			if (this.mode === "purchase") {
				let currentDate = new Date();
				let orderTimerData = await this.api.get(`native/single_supplier/${warehouse}/${supplier}/${currentDate.getTime()}`);
				if (orderTimerData.data.suppliers_date == null) {
					orderArrivalDate = "No data";
				} else {
					let buffDate = orderTimerData.data.suppliers_date.date;
					let deliveryDays = orderTimerData.data.suppliers_date.delivery_days;
					
					orderArrivalDate = new Date(buffDate);
					orderArrivalDate.setDate(orderArrivalDate.getDate() + deliveryDays);
					orderArrivalDate = orderArrivalDate.toISOString().split('T')[0];
				}
				
			}
			
			this.products.push({
				product_id: barcodeData.product_id,
				product: barcodeData.name,
				quantity: 1,
				units_in_package: barcodeData.quantity,
				units: barcodeData.quantity,
				unit_price: unitPrice,
				package_price: unitPrice,
				barcode: this.currentBarcode,
				onhand: stockOnhandQuantity,
				reserved: stockReservedQuantity,
				ordered: stockOrderedQuantity,
				available: stockAvailableQuantity,
				rest_available: restAvailable,
				order_arrival_date: orderArrivalDate,
				attributes: barcodeData.attributes
			});
			
			this.$emit("input", this.products);
			if (this.mode === "taking") {
				this.focusUnits();
			} else if (barcodeData.quantity === 1) {
				this.focusUnits();
			} else {
				this.focusQuantity();
			}
		},
		
		focusBarcode: function() {
			document.getElementById("barcode").focus();
		},
		
		focusQuantity: function() {
			this.$nextTick(() => {
				if (document.getElementById("quantity")) {
					document.getElementById("quantity").focus();
				}
			});
		},
		
		focusUnits: function() {
			this.$nextTick(() => {
				if (document.getElementById("units")) {
					document.getElementById("units").focus();
				}
			});
		},
		
		focusPrice: function() {
			document.getElementById("price").focus();
		},

		focusPackagePrice: function() {
			this.$nextTick(() => {
				if (document.getElementById("package_price")) {
					document.getElementById("package_price").focus();
				}
			});
		},

		changeUnits: function(value, index) {
			if (value < 0) {
				value = 0;
			}
			
			let realIndex = this.products.length - index - 1;
			let currentVal = this.products[realIndex];
			
			let newVal = {
				...currentVal,
				units: value,
				quantity: Math.floor(value / currentVal.units_in_package)
			};
			
			this.products[realIndex] = newVal;
			this.$emit("input", this.products);
		}
	}
};
</script>

<style scoped>
.remove_item {
	background-color: transparent;
}
.remove_icon {
	--v-icon-color: var(--foreground-subdued);
	transition: 0.1s;
}
.remove_icon:hover {
	color: red;
}
.product_table {
	width: 100%;
}
.product_line, .product_line_header {
	margin-top: 10px;
	align-items: center;
}
.product_quantity {
	width: 10%;
	margin-left: 10px;
	margin-right: 10px;
}
.product_price {
	margin-left: 10%;
	width: 10%;
}
.product_name {
	width: auto;
	margin-left: 10px;
}
.product_name_header {
	width: auto;
	font-weight: bold;
}
.product_price_header {
	font-weight: bold;
}
.product_quantity_header {
	width: 10%;
	margin-left: 10px;
	font-weight: bold;
}
.product_list_item:nth-of-type(even) {
	background-color: #F7FAFC;
} 
.product_list_item {
	cursor: pointer;
	border-collapse: separate;
	border-radius: 5px;
	padding-left: 10px;
	padding-right: 10px;
}
.product_table > tr:nth-child(2){
		background-color: rgb(164, 206, 102);
	} 

.attributes_cell {
	padding: 8px;
	max-width: 200px;
}

.attribute_line {
	display: flex;
	gap: 4px;
	align-items: center;
	font-size: 0.9em;
	line-height: 1.4;
}

.attribute_name {
	font-weight: 500;
}

.attribute_separator {
	color: var(--foreground-subdued);
}

.attribute_value {
	color: var(--foreground-normal);
}

.scanner-container {
	display: flex;
	gap: 8px;
	margin-bottom: 8px;
}

.scanner-input {
	flex: 1;
}

.find-button {
	white-space: nowrap;
}

.package-price-col {
	padding-right: 20px !important;
}

.units-col {
	padding-left: 20px !important;
}
</style>
