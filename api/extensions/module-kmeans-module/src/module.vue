<template>
	<private-view title="Kmeans Clustering">
		<v-sheet>

			WarehouseID
			<v-input v-model="warehouseId" :value="warehouseId" @input="$emit('update:modelValue', $event.target.value)" style="width: 50%;"/>
			ProductID
			<v-input v-model="productId" :value="productId" @input="$emit('update:modelValue', $event.target.value)" style="width: 50%;"/>
			ClusterNum
			<v-input v-model="clusterNum" :value="clusterNum" @input="$emit('update:modelValue', $event.target.value)"/>
			TimeGap
			<v-input v-model="timegap" :value="timegap" @input="$emit('update:modelValue', $event.target.value)"/>
			<v-button v-on:submit.prevent v-on:click="startCluster(productId,clusterNum,timegap)">Begin Kmeans Clustering</v-button>
		</v-sheet>
	</private-view>
</template>

<script>
export default {
	data(){
		return{
		warehouseId:null,
		productId:null,
		clusterNum:null,
		timegap:null
	}
	},
	inject:['api'],
	methods:{
		
		startCluster: function(productId,clusterNum,timegap,warehouseId){
			console.log(this.productId,this.clusterNum)
			if(timegap == null){
			this.api.get(`/kmeans_clustering/${productId}/${clusterNum}`);
			}
			else if(warehouseId == null ){
				this.api.get(`/kmeans_clustering/byDate/${productId}/${timegap}/${clusterNum}`);
			}
			else{
				this.api.get(`/kmeans_clustering/with_wh/${productId}/${warehouseId}/${timegap}/${clusterNum}`);
			}
		}
	}
};
</script>
