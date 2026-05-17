import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const ProductsContext = createContext({ products: [], allProducts: [], updateAllProducts: async () => {} });

/** Normalize stored data — handles both legacy string[] and new object[] */
function normalizeProducts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      return {
        id: item.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: item,
        gamp5_category: '',
        gxp_risk: '',
        business_owner: '',
        system_owner: '',
        quality_owner: '',
        active: true,
      };
    }
    return { active: true, ...item };
  });
}

export function ProductsProvider({ children }) {
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        try {
          setAllProducts(normalizeProducts(JSON.parse(s.products || '[]')));
        } catch {
          setAllProducts([]);
        }
      })
      .catch(() => {});
  }, []);

  const updateAllProducts = useCallback(async (newList) => {
    await api.updateSettings({ products: JSON.stringify(newList) });
    setAllProducts(newList);
  }, []);

  // Backward-compatible: only active product names, used by all dropdowns/filters
  const products = allProducts.filter((p) => p.active).map((p) => p.name);

  return (
    <ProductsContext.Provider value={{ products, allProducts, updateAllProducts }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
