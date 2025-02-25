<template>
	<div class="stock" v-if="this.stockData">
		<div v-if="this.available > 0" class="in_stock">available:
			 {{ this.available }}
			
			</div>
		<div v-else class="out_of_stock">available: {{ this.available }}</div>
		<div>onhand: {{ this.onhand }}</div>
		<div>reserved: {{ this.reserved }}</div>
		<div>ordered: {{ this.ordered }}</div>
	</div>
	<div v-else>No data</div>
	
</template>

<script>
import {useApi,useStores} from '@directus/extensions-sdk';
export default {
	
		props: {
			value: {
				type: String,
				default: null,
			}
			


		},
		data(){
			return{
				stockData: false,
				available:null,
				onhand:null,
				reserved:null,
				ordered:null

			}
		},

	setup(){
		
	},
	
	 methods:{
		getCurrentOrderProduct : async function(){
			const api = useApi();
			const {useCollectionsStore} = useStores();
			const collectionStore = useCollectionsStore();
			const orderProduct = await api.get(`items/order_products/${this.value}`);
			//console.log(orderProduct.data.data);
			let item = orderProduct.data.data;
			let productId = item.product;
			let warehouseId = item.warehouse;
			let stockResponse = await api.get(`items/stock?filter[warehouse][_eq]=${warehouseId}&filter[product][_eq]=${productId}`);
			
			 if(stockResponse.data.data.length > 0){
				
				
			let stockItem = stockResponse.data.data[0];
			
			this.available = Number(stockItem.available_quantity);
			this.reserved = stockItem.reserved_quantity;
			this.onhand = stockItem.onhand_quantity;
			this.ordered = stockItem.ordered_quantity;

			this.stockData = true
			

			 }
			 else{
				this.available ="no data";
				this.reserved = "no data";
				this.onhand ="no data";
				this.ordered ="no data";
				this.stockData = false;
			 }
			return ;

		},
		




	},
	async beforeMount() {
		await this.getCurrentOrderProduct();
	
	}

};
</script>
