<template>
	<div v-if="recursive && displayItem.length > 0" :class="wrapperClass">
		<div :class="innerClass" v-for="(item, index) in displayItem" :key="index">
			<div v-html="item"></div>
		</div>
	</div>
	<div v-else-if="displayItem" v-html="displayItem"></div>
	<div v-else>{{ emptyMessage }}</div>
</template>

<script>
export default {
	props: {
		value: {
			type: [String, Object, Array],
			default: null,
		},
		format: {
			type: String,
			default: null,
		},
		recursive: {
			type: Boolean,
			default: false,
		},
		wrapperClass: {
			type: String,
			default: "json_display_wrapper",
		},
		innerClass: {
			type: String,
			default: "json_list",
		},
		emptyMessage: {
			type: String,
			default: "No data available",
		}
	},
	data() {
		return {
			displayItem: "",
		}
	},
	watch: {
		value: {
			immediate: true,
			handler() {
				this.compute();
			},
		},
	},
	methods: {
		formatRecursive(item, format) {
			if (!item || typeof item !== 'object') {
				return [];
			}
			let formattedValues = [];
			if (Array.isArray(item)) {
				item.forEach(obj => {
					if (typeof obj === 'object' && obj !== null) {
						let formattedString = format;
						for (const [key, value] of Object.entries(obj)) {
							formattedString = formattedString.replace(`{${key}}`, value ?? '');
						}
						formattedValues.push(formattedString);
					}
				});
			} else {
				for (const [key, value] of Object.entries(item)) {
					let formattedString = format
						.replace("{key}", key)
						.replace("{value}", value ?? '');
					formattedValues.push(formattedString);
				}
			}
			return formattedValues;
		},

		formatJsonToHtml(formatString, dataJson) {	
			if (Array.isArray(dataJson)) {
				return dataJson.map(item => {
					if (typeof item === 'object' && item !== null) {
						return formatString.replace(/\{(\w+)\}/g, (match, key) => {
							return item[key] !== undefined ? item[key] : '';
						});
					}
					return '';
				}).filter(Boolean).join('<br>');
			} else if (typeof dataJson === 'object' && dataJson !== null) {
				return formatString.replace(/\{(\w+)\}/g, (match, key) => {
					return dataJson[key] !== undefined ? dataJson[key] : '';
				});
			}
			return '';
		},

		compute() {
			console.log("compute called with value:", this.value);
			console.log("Format:", this.format);
			console.log("Recursive:", this.recursive);

			if (this.value === null || this.value === undefined || this.value === '') {
				this.displayItem = '';
				return;
			}

			let dataJson = this.value;
			if (typeof this.value === "string") {
				try {
					dataJson = JSON.parse(this.value);
				} catch (e) {
					console.error("Failed to parse JSON:", e);
					this.displayItem = "Invalid JSON data";
					return;
				}
			}

			if (typeof dataJson !== 'object' && !Array.isArray(dataJson)) {
				console.error("Invalid data type after processing:", dataJson);
				this.displayItem = "Invalid data type";
				return;
			}

			console.log("Processed dataJson:", dataJson);

			if (this.recursive) {
				this.displayItem = this.formatRecursive(dataJson, this.format);
			} else {
				this.displayItem = this.formatJsonToHtml(this.format, dataJson);
			}

			console.log("Final displayItem:", this.displayItem);
		}
	},
	mounted() {
		console.log("Component mounted. Props:", {
			value: this.value,
			format: this.format,
			recursive: this.recursive,
			wrapperClass: this.wrapperClass,
			innerClass: this.innerClass
		});
		this.compute();
	}
};
</script>