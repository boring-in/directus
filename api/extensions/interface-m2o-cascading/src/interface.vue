<template>
    <div class="cascading-select">
        <!-- Display Mode - when value is selected -->
        <v-menu
            v-if="isDisplayMode"
            attached
            :disabled="disabled"
            :close-on-content-click="true"
        >
           <template #activator="{ active, activate }">
                <v-input
                    :model-value="displayValue"
                    :disabled="disabled"
                    readonly
                    @focus="activate"
                >
                    <template #input>
                        <div class="display-value" v-html="displayValue"></div>
                    </template>
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
        <div v-else class="dropdowns-container">
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
                        @update:model-value="debouncedHandleParentSearch"
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

                <div class="content">
                    <v-list class="list">
                        <v-list-item
                            v-for="item in filteredParentResults"
                            :key="item.id"
                            :active="parentValue === item.id"
                            :disabled="disabled"
                            @click="item && item.id ? setParentDropdown(item) : console.log('Invalid item clicked:', item)"
                        >
                            <v-list-item-content>
                                <span class="item-text" v-html="highlightMatches(item.label, parentSearchQuery)"></span>
                            </v-list-item-content>
                        </v-list-item>
                        <v-list-item 
                            v-if="enablePagination && !parentLoading && hasMoreParentResults"
                            @click="loadMoreParents"
                            class="load-more-item"
                        >
                            <v-list-item-content>
                                <span class="load-more-text">Load More...</span>
                            </v-list-item-content>
                        </v-list-item>
                        <v-list-item v-if="parentLoading">
                            <v-list-item-content>
                                <v-progress-circular indeterminate small />
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </div>
            </v-menu>

            <!-- Child Dropdown -->
            <v-menu 
                v-if="parentValue && hasChildResults"
                attached
                :disabled="disabled"
                :close-on-content-click="true"
            >
                <template #activator="{ active, activate }">
                    <v-input
                        v-model="childSearchQuery"
                        :disabled="disabled || !parentValue"
                        :placeholder="childPlaceholder"
                        :class="{ 'has-value': modelValue }"
                        :nullable="false"
                        @focus="activate"
                        @update:model-value="debouncedHandleChildSearch"
                    >
                        <template #append>
                            <v-icon 
                                v-if="modelValue" 
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

                <div class="content">
                    <v-list class="list">
                        <v-list-item
                            v-for="item in filteredChildResults"
                            :key="item.id"
                            :active="modelValue === item.id"
                            :disabled="disabled"
                            @click="setChildDropdown(item)"
                        >
                            <v-list-item-content>
                                <span class="item-text" v-html="highlightMatches(item.label, childSearchQuery)"></span>
                            </v-list-item-content>
                        </v-list-item>
                        <v-list-item 
                            v-if="enablePagination && !childLoading && hasMoreChildResults"
                            @click="loadMoreChildren"
                            class="load-more-item"
                        >
                            <v-list-item-content>
                                <span class="load-more-text">Load More...</span>
                            </v-list-item-content>
                        </v-list-item>
                        <v-list-item v-if="childLoading">
                            <v-list-item-content>
                                <v-progress-circular indeterminate small />
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </div>
            </v-menu>
        </div>
    </div>
</template>

<script lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import get from 'lodash/get';
import debounce from 'lodash/debounce';

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
        modelValue: {
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
        headers: {
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
        template: {
            type: String,
            required: true,
        },
        enablePagination: {
            type: Boolean,
            default: false
        },
        pageSize: {
            type: Number,
            default: 50
        },
        enableServerSearch: {
            type: Boolean,
            default: false
        },
        parentSearchEndpoint: {
            type: String,
            default: ''
        },
        childSearchEndpoint: {
            type: String,
            default: ''
        },
        searchParamName: {
            type: String,
            default: 'search'
        },
        primaryKey: {
            type: [String, Number],
            default: null,
        }
    },
    
    emits: ['input', 'update:modelValue'],
    
    setup(props, { emit }) {
        const api = useApi();
        const { useRelationsStore } = useStores();
        const relationsStore = useRelationsStore();
        
        const relation = computed(() => {
            return relationsStore.getRelationsForField(props.collection, props.field)?.[0];
        });

        interface ResultItem {
            id: string | number;
            label: string;
            originalData: any;
        }

        // State management
        const displayValue = ref('');
        const parentValue = ref<string | number | null>(null);
        const parentSearchQuery = ref('');
        const childSearchQuery = ref('');
        const allParentResults = ref<ResultItem[]>([]);
        const allChildResults = ref<ResultItem[]>([]);
        const parentCurrentPage = ref(1);
        const childCurrentPage = ref(1);
        const parentTotalCount = ref(0);
        const childTotalCount = ref(0);
        const parentLoading = ref(false);
        const childLoading = ref(false);
        const hasChildResults = ref(false);

        // Helper function to emit both events
        function emitValue(value: string | number | null) {
            console.log("Emitting value:", value, "Type:", typeof value);
            emit('input', value);
            emit('update:modelValue', value);
        }

        function matchesWildcardPattern(text: string, pattern: string): boolean {
            if (!text || !pattern) return false;
            const searchParts = pattern.trim().split(' ').filter(Boolean);
            return searchParts.every(part => 
                text.toLowerCase().includes(part.toLowerCase())
            );
        }

        function highlightMatches(text: string, pattern: string): string {
            if (!text || !pattern) return text;
            const searchParts = pattern.trim().split(' ').filter(Boolean);
            if (searchParts.length === 0) return text;
            let highlightedText = text;
            searchParts.forEach(part => {
                const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedPart, 'gi');
                highlightedText = highlightedText.replace(regex, match => 
                    `<span class="highlight">${match}</span>`
                );
            });
            return highlightedText;
        }

        function processTemplate(template: string, data: Record<string, any>, prefix = ''): string {
            return Object.entries(data).reduce((result: string, [key, value]) => {
                const path = prefix ? `${prefix}.${key}` : key;
                
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return processTemplate(result, value, path);
                }
                
                const regex = new RegExp(`{{${path}}}`, 'g');
                return result.replace(regex, value ?? '');
            }, template);
        }

        function cleanupTemplate(processedTemplate: string): string {
            const cleaned = processedTemplate.replace(/{{[^}]+}}/g, '');
            return cleaned.replace(/\s+/g, ' ').trim();
        }

        function buildUrl(baseUrl: string, params: Record<string, string | number>) {
            // Replace {{$CURRENT_ID}} with actual primaryKey if available
            let processedUrl = baseUrl.replace(/{{(\$CURRENT_ID)}}/g, props.primaryKey?.toString() || '');
            console.log("Processed URL with CURRENT_ID replacement:", processedUrl, "Primary Key:", props.primaryKey);
            
            const isAbsolute = processedUrl.startsWith('http://') || processedUrl.startsWith('https://');
            const url = isAbsolute ? new URL(processedUrl) : new URL(processedUrl, window.location.origin);
            
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.append(key, String(value));
                }
            });
            
            return isAbsolute ? url.toString() : url.pathname + url.search;
        }

        function getValueByPath(obj: any, path: string) {
            if (obj && obj[path] !== undefined) {
                return obj[path];
            }
            return get(obj, path);
        }

        async function fetchParentResults(loadMore = false) {
            try {
                // Skip fetch if we need primaryKey but it's not available yet
                if (props.parentEndpoint.includes('{{$CURRENT_ID}}') && props.primaryKey == "+") {
                    console.log('Skipping fetch - waiting for primaryKey');
                    return;
                }

                if (!loadMore) {
                    parentCurrentPage.value = 1;
                }
                
                parentLoading.value = true;
                
                const params: Record<string, string | number> = {};
                
                if (props.enablePagination) {
                    params.page = parentCurrentPage.value;
                    params.limit = props.pageSize;
                }
                
                if (props.enableServerSearch && parentSearchQuery.value) {
                    params[props.searchParamName] = parentSearchQuery.value;
                }

                const url = buildUrl(props.parentEndpoint, params);
                console.log("Fetching parent data from URL:", url);
                const response = await fetch(url, {
                    headers: props.headers
                });
                
                if (!response.ok) throw new Error('Failed to fetch parent data');
                
                const data = await response.json();
                console.log("Parent API response:", data);
                
                // Handle Directus API response format
                const responseData = data.data || (Array.isArray(data) ? data : []);
                const total = data.pagination?.total || responseData.length;
                
                if (props.enablePagination) {
                    parentTotalCount.value = total;
                }
                
                const processedResults = (Array.isArray(responseData) ? responseData : [responseData]).map(item => {
                    const id = getValueByPath(item, props.parentIdPath);
                    const label = getValueByPath(item, props.parentLabelPath);
                    console.log(`Extracted parent - ID: ${id} (${typeof id}), Label: ${label}`);

                    const processed = {
                        id: id,
                        label: label,
                        originalData: item
                    };

                    if (!processed.id || !processed.label) {
                        console.log("Warning: Item missing ID or label:", item);
                        // Could either filter these out or provide defaults
                        processed.id = processed.id || `missing_${Math.random()}`;
                        processed.label = processed.label || "Unknown";
                    }

                    return processed;
                });

                console.log("Processed parent results:", processedResults);
                
                if (parentCurrentPage.value === 1 || !props.enablePagination) {
                    allParentResults.value = processedResults;
                } else {
                    allParentResults.value = [...allParentResults.value, ...processedResults];
                }
                
                parentLoading.value = false;
            } catch (err) {
                console.error("Error fetching parent results:", err);
                parentLoading.value = false;
                allParentResults.value = [];
            }
        }

        async function fetchChildResults(parentId: string | number, loadMore = false) {
            try {
                if (!loadMore) {
                    childCurrentPage.value = 1;
                }
                
                childLoading.value = true;
                
                let endpoint = props.childEndpoint.replace('{id}', String(parentId));
                
                const params: Record<string, string | number> = {};
                
                if (props.enablePagination) {
                    params.page = childCurrentPage.value;
                    params.limit = props.pageSize;
                }
                
                if (props.enableServerSearch && childSearchQuery.value) {
                    params[props.searchParamName] = childSearchQuery.value;
                }

                const url = buildUrl(endpoint, params);
                console.log("Fetching child data from URL:", url);
                const response = await fetch(url, {
                    headers: props.headers
                });
                
                if (!response.ok) throw new Error('Failed to fetch child data');
                
                const data = await response.json();
                console.log("Child API response:", data);
                
                const responseData = Array.isArray(data) ? data : (data.data || []);
                const total = data.pagination?.total || responseData.length;
                
                if (props.enablePagination) {
                    childTotalCount.value = total;
                }
                
                const dataArray = Array.isArray(responseData) ? responseData : [responseData];
                const processedResults = dataArray.map(item => {
                    const id = getValueByPath(item, props.childIdPath);
                    const label = getValueByPath(item, props.childLabelPath);
                    console.log(`Extracted child - ID: ${id} (${typeof id}), Label: ${label}`);
                    
                    return {
                        id: id,
                        label: label,
                        originalData: item
                    };
                });
                
                childLoading.value = false;
                console.log("Processed child results:", processedResults);
                
                if (childCurrentPage.value === 1 || !props.enablePagination) {
                    return processedResults;
                } else {
                    return [...allChildResults.value, ...processedResults];
                }
            } catch (err) {
                console.error("Error fetching child results:", err);
                childLoading.value = false;
                return [];
            }
        }

        async function fetchDisplayValue() {
            if (!props.value && !props.modelValue) return;
            
            const valueToFetch = props.modelValue ?? props.value;

            const searchItem = allParentResults.value.find(item => item.id === valueToFetch);
            if (searchItem) {
                displayValue.value = props.template
                    ? cleanupTemplate(processTemplate(props.template, searchItem.originalData))
                    : searchItem.label;
                return;
            }

            try {
                const collection = relation.value?.related_collection;
                if (!collection) return;

                const response = await api.get(`/items/${collection}/${valueToFetch}`, {
                    params: {
                        fields: '*.*'
                    }
                });
                
                const item = response.data.data;
                
                if (item) {
                    if (!props.template) {
                        displayValue.value = item.id;
                        return;
                    }
                    
                    displayValue.value = cleanupTemplate(processTemplate(props.template, item));
                }
            } catch (err) {
                console.log("Error fetching display value:", err);
            }
        }

        async function setParentDropdown(item: ResultItem | null) {
            console.log("Parent item being clicked:", item);
            
            if (item === null) {
                clearParentSelection();
                return;
            }

            // Validate item has required properties
            if (!item.id || !item.label) {
                console.log("Item missing required properties - ID or label");
                return;
            }
            
            console.log("Item ID type:", typeof item.id);

            // Set the value and display first
            parentValue.value = item.id;
            parentSearchQuery.value = item.label;
            displayValue.value = props.template 
                ? cleanupTemplate(processTemplate(props.template, item.originalData))
                : item.label;

            // Always emit the value immediately when selected
            console.log("Setting item with id:", item.id);
            emitValue(item.id);

            // For server-side search, don't check for children
            if (props.enableServerSearch && parentSearchQuery.value) {
                hasChildResults.value = false;
                allChildResults.value = [];
                childSearchQuery.value = '';
                return;
            }

            // For regular browsing, check for children
            const childResults = await fetchChildResults(item.id);
            
            if (childResults.length === 0) {
                hasChildResults.value = false;
            } else {
                hasChildResults.value = true;
                allChildResults.value = childResults;
                childSearchQuery.value = '';
            }
        }

        function setChildDropdown(item: ResultItem | null) {
            console.log("Child item being clicked:", item);
            if (item === null) {
                childSearchQuery.value = '';
                emitValue(null);
            } else {
                childSearchQuery.value = item.label;
                emitValue(item.id);
            }
        }

        function clearParentSelection() {
            parentValue.value = null;
            parentSearchQuery.value = '';
            childSearchQuery.value = '';
            allChildResults.value = [];
            emitValue(null);
        }

        function clearSelection() {
            displayValue.value = '';
            emitValue(null);
        }

        const debouncedHandleParentSearch = debounce(async (value) => {
            parentSearchQuery.value = value;
            
            // Only reset page and clear results if we're going to fetch from server
            if (props.enableServerSearch || (props.enablePagination && !value)) {
                parentCurrentPage.value = 1;
                allParentResults.value = [];
                await fetchParentResults();
            }
        }, 300);

        const debouncedHandleChildSearch = debounce((value) => {
            childSearchQuery.value = value;
            
            if (!parentValue.value) return;
            
            childCurrentPage.value = 1;
            
            if (props.enableServerSearch || (props.enablePagination && !value)) {
                fetchChildResults(parentValue.value).then(results => {
                    allChildResults.value = results;
                });
            }
        }, 300);

        const filteredParentResults = computed<ResultItem[]>(() => {
            if (props.enableServerSearch) return allParentResults.value;
            
            if (!parentSearchQuery.value) return allParentResults.value;
            return allParentResults.value.filter(item => 
                matchesWildcardPattern(item.label, parentSearchQuery.value)
            );
        });

        const filteredChildResults = computed<ResultItem[]>(() => {
            if (props.enableServerSearch) return allChildResults.value;
            
            if (!childSearchQuery.value) return allChildResults.value;
            return allChildResults.value.filter(item => 
                matchesWildcardPattern(item.label, childSearchQuery.value)
            );
        });

        const hasMoreParentResults = computed(() => {
            if (!props.enablePagination) return false;
            return allParentResults.value.length < parentTotalCount.value;
        });

        const hasMoreChildResults = computed(() => {
            if (!props.enablePagination) return false;
            return allChildResults.value.length < childTotalCount.value;
        });

        async function loadMoreParents() {
            if (parentLoading.value || !hasMoreParentResults.value) return;
            parentCurrentPage.value++;
            await fetchParentResults(true);
        }

        async function loadMoreChildren() {
            if (childLoading.value || !hasMoreChildResults.value || !parentValue.value) return;
            childCurrentPage.value++;
            const newResults = await fetchChildResults(parentValue.value, true);
            allChildResults.value = newResults;
        }

        watch([() => props.value, () => props.modelValue], async ([newValue, newModelValue]) => {
            const value = newModelValue ?? newValue;

            if (value === null) {
                displayValue.value = '';
                parentValue.value = null;
                childSearchQuery.value = '';
                allChildResults.value = [];
                hasChildResults.value = false;
                if (!props.parentEndpoint.includes('{{$CURRENT_ID}}') || props.primaryKey) {
                    fetchParentResults();
                }
            } else if (value !== parentValue.value) {
                await fetchDisplayValue();
                parentValue.value = value;
            }
        }, { immediate: true });

        onMounted(() => {
            if (props.value === null && props.modelValue === null) {
                // Initial fetch only if we don't need primaryKey or it's already available
                if (!props.parentEndpoint.includes('{{$CURRENT_ID}}') || props.primaryKey != "+") {
                    fetchParentResults();
                }
                
                // Watch for primaryKey changes
                watch(
                    () => props.primaryKey,
                    (newKey) => {
                        if (newKey) {
                            console.log('PrimaryKey hydrated:', newKey);
                            fetchParentResults();
                        }
                    }
                );
            }
        });

        const isDisplayMode = computed(() => {
            const value = props.modelValue ?? props.value;
            return value !== null && displayValue.value !== '';
        });

        return {
            displayValue,
            clearSelection,
            parentValue,
            parentSearchQuery,
            childSearchQuery,
            filteredParentResults,
            filteredChildResults,
            setParentDropdown,
            setChildDropdown,
            clearParentSelection,
            debouncedHandleParentSearch,
            debouncedHandleChildSearch,
            highlightMatches,
            hasChildResults,
            isDisplayMode,
            parentLoading,
            childLoading,
            hasMoreParentResults,
            hasMoreChildResults,
            loadMoreParents,
            loadMoreChildren
        };
    },
};
</script>

<style scoped>
.cascading-select {
    width: 100%;
}

.dropdowns-container {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
}

.dropdowns-container > * {
    flex: 1;
    min-width: 200px;
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

.custom-display {
    display: flex;
    align-items: center;
    gap: 8px;
}

.custom-display .related {
    color: var(--theme--foreground-subdued);
    font-size: 0.9em;
}

:deep(.highlight) {
    background-color: var(--theme--primary-subdued);
    padding: 0 2px;
    border-radius: 2px;
}

.display-value {
    width: 100%;
}

.load-more-item {
    border-top: 1px solid var(--theme--background-normal);
    justify-content: center;
}

.load-more-text {
    color: var(--theme--primary);
    font-size: 0.9em;
}
</style>
