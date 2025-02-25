<template>
    <div class="cascading-select">
        <!-- Display Mode - when value is selected -->
        <v-menu
            v-if="value !== null"
            attached
            :disabled="disabled"
            :close-on-content-click="true"
        >
            <template #activator="{ active, activate }">
                <v-input
                    v-model="displayValue"
                    :disabled="disabled"
                    readonly
                    @focus="activate"
                >
                    <template #append>
                        <v-icon
                            clickable
                            name="close"
                            @click.stop="clearSelection"
                        />
                    </template>
                </v-input>
            </template>
        </v-menu>

        <!-- Selection Mode - parent/child dropdowns -->
        <template v-else>
            <!-- Parent Dropdown -->
            <v-menu 
                attached
                :disabled="disabled"
                :close-on-content-click="true"
            >
                <template #activator="{ active, activate }">
                    <v-input
                        v-model="parentSearchQuery"
                        :disabled="disabled"
                        :placeholder="parentPlaceholder"
                        :class="{ 'has-value': parentValue }"
                        :nullable="false"
                        @focus="activate"
                        @update:model-value="filterParentResults"
                    >
                        <template #append>
                            <v-icon 
                                v-if="parentValue" 
                                clickable 
                                name="close" 
                                @click="clearParentSelection" 
                            />
                            <v-icon
                                v-else
                                clickable
                                name="expand_more"
                                class="open-indicator"
                                :class="{ open: active }"
                                @click="activate"
                            />
                        </template>
                    </v-input>
                </template>

                <div class="content" :class="width">
                    <v-list class="list">
                        <v-list-item
                            v-for="item in filteredParentResults"
                            :key="getValueByPath(item, parentIdPath)"
                            :active="parentValue === getValueByPath(item, parentIdPath)"
                            :disabled="disabled"
                            @click="setParentDropdown(item)"
                        >
                            <v-list-item-content>
                                <span class="item-text">{{ getValueByPath(item, parentLabelPath) }}</span>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </div>
            </v-menu>

            <!-- Child Dropdown -->
            <v-menu 
                v-if="parentValue"
                attached
                :disabled="disabled"
                :close-on-content-click="true"
            >
                <template #activator="{ active, activate }">
                    <v-input
                        v-model="childSearchQuery"
                        :disabled="disabled || !parentValue"
                        :placeholder="childPlaceholder"
                        :class="{ 'has-value': value }"
                        :nullable="false"
                        @focus="activate"
                        @update:model-value="filterChildResults"
                    >
                        <template #append>
                            <v-icon 
                                v-if="value" 
                                clickable 
                                name="close" 
                                @click="setChildDropdown(null)" 
                            />
                            <v-icon
                                v-else
                                clickable
                                name="expand_more"
                                class="open-indicator"
                                :class="{ open: active }"
                                @click="activate"
                            />
                        </template>
                    </v-input>
                </template>

                <div class="content" :class="width">
                    <v-list class="list">
                        <v-list-item
                            v-for="item in filteredChildResults"
                            :key="getValueByPath(item, childIdPath)"
                            :active="value === getValueByPath(item, childIdPath)"
                            :disabled="disabled"
                            @click="setChildDropdown(item)"
                        >
                            <v-list-item-content>
                                <span class="item-text">{{ getValueByPath(item, childLabelPath) }}</span>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </div>
            </v-menu>
        </template>
    </div>
</template>

<script lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import get from 'lodash/get';

export default {
    props: {
        disabled: {
            type: Boolean,
            default: false,
        },
        collection: {
            type: String,
            required: true,
        },
        field: {
            type: String,
            required: true,
        },
        value: {
            type: [String, Number],
            default: null,
        },
        parentEndpoint: {
            type: String,
            required: true,
        },
        childEndpoint: {
            type: String,
            required: true,
        },
        parentHeaders: {
            type: Object,
            default: () => ({}),
        },
        childHeaders: {
            type: Object,
            default: () => ({}),
        },
        parentIdPath: {
            type: String,
            required: true,
        },
        parentLabelPath: {
            type: String,
            required: true,
        },
        childIdPath: {
            type: String,
            required: true,
        },
        childLabelPath: {
            type: String,
            required: true,
        },
        parentPlaceholder: {
            type: String,
            default: 'Select parent item',
        },
        childPlaceholder: {
            type: String,
            default: 'Select child item',
        },
        width: {
            type: String,
            required: true,
        },
		template: {
			type: String,
			required: true, // arba default: '{{id}}' jei norite default reikšmės
		},
    },
    
    emits: ['input'],
    
    setup(props, { emit }) {
        const api = useApi();
        const { useRelationsStore } = useStores();
        const relationsStore = useRelationsStore();
        
        // Get relation info
        const relation = computed(() => {
            return relationsStore.getRelationsForField(props.collection, props.field)?.[0];
        });

        // State for display mode
        const displayValue = ref('');
        
        // State for selection mode
        const parentValue = ref(null);
        const parentSearchQuery = ref('');
        const childSearchQuery = ref('');
        const allParentResults = ref([]);
        const allChildResults = ref([]);

        // Computed properties for filtering
        const filteredParentResults = computed(() => {
            if (!parentSearchQuery.value) return allParentResults.value;
            
            const searchTerm = parentSearchQuery.value.toLowerCase();
            return allParentResults.value.filter(item => {
                const label = getValueByPath(item, props.parentLabelPath);
                return String(label).toLowerCase().includes(searchTerm);
            });
        });

        const filteredChildResults = computed(() => {
            if (!childSearchQuery.value) return allChildResults.value;
            
            const searchTerm = childSearchQuery.value.toLowerCase();
            return allChildResults.value.filter(item => {
                const label = getValueByPath(item, props.childLabelPath);
                return String(label).toLowerCase().includes(searchTerm);
            });
        });

        // Watch for value changes to update display
        watch(() => props.value, async (newValue) => {
            if (newValue !== null) {
                await fetchDisplayValue();
            }
        }, { immediate: true });

        // Fetch and format display value from Directus
        async function fetchDisplayValue() {
            if (!props.value) return;

			try {
				const collection = relation.value?.related_collection;
				if (!collection) return;

				const response = await api.get(`/items/${collection}/${props.value}`);
				const item = response.data.data;
				
				if (item) {
					if (!props.template) {
						displayValue.value = item.id; // fallback to id if no template
						return;
					}
					
					// Apply display template
					let template = props.template;
					if (typeof template === 'string') {
						Object.keys(item).forEach(key => {
							template = template.replace(new RegExp(`{{${key}}}`, 'g'), item[key] ?? '');
						});
						displayValue.value = template;
					} else {
						displayValue.value = item.id; // fallback to id if template is invalid
					}
				}
			} catch (err) {
				console.error('Error fetching display value:', err);
				displayValue.value = 'Error loading item';
			}
        }

        // Selection mode functions
        async function fetchParentResults() {
            try {
                const response = await fetch(props.parentEndpoint, {
                    headers: props.parentHeaders
                });
                
                if (!response.ok) throw new Error('Failed to fetch parent data');
                
                const data = await response.json();
                allParentResults.value = Array.isArray(data) ? data : [data];
            } catch (err) {
                console.error('Error fetching parent data:', err);
                allParentResults.value = [];
            }
        }

        async function fetchChildResults() {
            if (!parentValue.value) return;

            try {
                const endpoint = props.childEndpoint.replace('{id}', parentValue.value);
                const response = await fetch(endpoint, {
                    headers: props.childHeaders
                });
                
                if (!response.ok) throw new Error('Failed to fetch child data');
                
                const data = await response.json();
                allChildResults.value = Array.isArray(data) ? data : [data];
            } catch (err) {
                console.error('Error fetching child data:', err);
                allChildResults.value = [];
            }
        }

        function getValueByPath(obj, path) {
            return get(obj, path);
        }

        function filterParentResults() {
            // Filtering handled by computed property
        }

        function filterChildResults() {
            // Filtering handled by computed property
        }

        function setParentDropdown(item) {
            if (item === null) {
                clearParentSelection();
            } else {
                const id = getValueByPath(item, props.parentIdPath);
                parentValue.value = id;
                parentSearchQuery.value = getValueByPath(item, props.parentLabelPath);
                fetchChildResults();
            }
        }

        function setChildDropdown(item) {
            if (item === null) {
                childSearchQuery.value = null;
                emit('input', null);
            } else {
                const id = getValueByPath(item, props.childIdPath);
                childSearchQuery.value = getValueByPath(item, props.childLabelPath);
                emit('input', id);
            }
        }

        function clearParentSelection() {
            parentValue.value = null;
            parentSearchQuery.value = null;
            childSearchQuery.value = null;
            allChildResults.value = [];
            emit('input', null);
        }

        function clearSelection() {
            displayValue.value = '';
            emit('input', null);
        }

        // Initialize parent data only when entering selection mode
        watch(() => props.value, (newValue) => {
            if (newValue === null) {
                fetchParentResults();
            }
        });

        // Initial data load if in selection mode
        onMounted(() => {
            if (props.value === null) {
                fetchParentResults();
            }
        });

        return {
            // Display mode
            displayValue,
            clearSelection,
            
            // Selection mode
            parentValue,
            parentSearchQuery,
            childSearchQuery,
            filteredParentResults,
            filteredChildResults,
            getValueByPath,
            setParentDropdown,
            setChildDropdown,
            clearParentSelection,
            filterParentResults,
            filterChildResults,
        };
    },
};
</script>

<style scoped>
.cascading-select {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.content .list li:hover {
    cursor: pointer;
}

.v-input {
    margin-bottom: 0;
}

.open-indicator {
    transition: transform 0.2s;
}

.open-indicator.open {
    transform: rotate(180deg);
}

.has-value {
    font-weight: 500;
}
</style>