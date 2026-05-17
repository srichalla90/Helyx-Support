import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';
import { useProducts } from '../context/ProductsContext';

const GAMP5_CATEGORIES = [
  'Category 1 – Infrastructure Software',
  'Category 3 – Non-configured Products',
  'Category 4 – Configured Software',
  'Category 5 – Custom Software',
];
const GXP_RISKS = ['High', 'Medium', 'Low', 'Not Applicable'];

const GXP_COLORS = {
  High:            { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  Medium:          { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  Low:             { bg: '#F0FDF4', color: '#065F46', border: '#A7F3D0' },
  'Not Applicable':{ bg: '#F9FAFB', color: '#374151', border: '#E5E7EB' },
};

function blankProduct() {
  return { id: '', name: '', gamp5_category: '', gxp_risk: '', business_owner: '', system_owner: '', quality_owner: '', active: true };
}

export default function ProductsPage() {
  const user   = useUser();
  const toast  = useToast();
  const isAdmin = user?.role === 'admin';
  const { allProducts, updateAllProducts } = useProducts();
  const [editing, setEditing] = useState(null);
  const [isNew,   setIsNew]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  const inp = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };

  function startNew()   { setEditing(blankProduct()); setIsNew(true); }
  function startEdit(p) { setEditing({ ...p }); setIsNew(false); }
  function cancel()     { setEditing(null); setIsNew(false); }

  function validate() {
    if (!editing.name.trim())           return 'Product name is required.';
    if (!editing.gamp5_category)        return 'GAMP 5 Category is required.';
    if (!editing.gxp_risk)              return 'GxP Risk is required.';
    if (!editing.business_owner.trim()) return 'Business Owner is required.';
    if (!editing.system_owner.trim())   return 'System Owner is required.';
    if (!editing.quality_owner.trim())  return 'Quality Owner is required.';
    return null;
  }

  async function save() {
    const err = validate();
    if (err) return toast(err, 'error');
    setSaving(true);
    try {
      let updated;
      if (isNew) {
        const id = editing.name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
        const newProduct = {
          ...editing, id,
          name:            editing.name.trim(),
          business_owner:  editing.business_owner.trim(),
          system_owner:    editing.system_owner.trim(),
          quality_owner:   editing.quality_owner.trim(),
        };
        if (allProducts.some((p) => p.name.toLowerCase() === newProduct.name.toLowerCase())) {
          return toast('A product with this name already exists.', 'error');
        }
        updated = [...allProducts, newProduct];
        toast('Product created', 'success');
      } else {
        updated = allProducts.map((p) =>
          p.id === editing.id
            ? { ...editing, name: editing.name.trim(), business_owner: editing.business_owner.trim(), system_owner: editing.system_owner.trim(), quality_owner: editing.quality_owner.trim() }
            : p
        );
        toast('Product saved', 'success');
      }
      await updateAllProducts(updated);
      cancel();
    } catch (e) { toast(e.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  }

  async function toggleActive(product) {
    setSaving(true);
    try {
      await updateAllProducts(allProducts.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
      toast(product.active ? 'Product deactivated' : 'Product activated', 'success');
    } catch (e) { toast(e.message || 'Failed to update', 'error'); }
    finally { setSaving(false); }
  }

  // ── Editor view ───────────────────────────────────────────────────────────────
  if (editing !== null) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button onClick={cancel} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
          ← Back to Products
        </button>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 24px' }}>
            {isNew ? 'Add Product' : 'Edit Product'}
          </h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
              Product Name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Helyx Analytics" style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                GAMP 5 Category <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select value={editing.gamp5_category} onChange={(e) => setEditing((f) => ({ ...f, gamp5_category: e.target.value }))} style={inp}>
                <option value="">— Select —</option>
                {GAMP5_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                GxP Risk <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select value={editing.gxp_risk} onChange={(e) => setEditing((f) => ({ ...f, gxp_risk: e.target.value }))} style={inp}>
                <option value="">— Select —</option>
                {GXP_RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
            {[
              { key: 'business_owner', label: 'Business Owner' },
              { key: 'system_owner',   label: 'System Owner'   },
              { key: 'quality_owner',  label: 'Quality Owner'  },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                  {label} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input value={editing[key]} onChange={(e) => setEditing((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder="Name or email" style={inp} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={cancel} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Products</h3>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Products appear in ticket forms, ideas, and filters. Deactivating hides a product from new submissions.
          </p>
        </div>
        {isAdmin && (
          <button onClick={startNew} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            + Add Product
          </button>
        )}
      </div>

      {allProducts.length === 0 ? (
        <div style={{ background: '#F9FAFB', border: '2px dashed #E5E7EB', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No products yet</div>
          {isAdmin && (
            <button onClick={startNew} style={{ marginTop: 12, padding: '8px 18px', fontSize: 13, fontWeight: 600, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Add your first product
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allProducts.map((p) => {
            const gxpStyle = GXP_COLORS[p.gxp_risk] || GXP_COLORS['Not Applicable'];
            return (
              <div key={p.id} style={{ background: p.active ? '#fff' : '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', opacity: p.active ? 1 : 0.65 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{p.name}</span>
                      {!p.active && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>Inactive</span>
                      )}
                      {p.gxp_risk && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: gxpStyle.bg, color: gxpStyle.color, border: `1px solid ${gxpStyle.border}` }}>
                          GxP: {p.gxp_risk}
                        </span>
                      )}
                      {p.gamp5_category && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                          {p.gamp5_category.split('–')[0].trim()}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Business Owner', value: p.business_owner },
                        { label: 'System Owner',   value: p.system_owner   },
                        { label: 'Quality Owner',  value: p.quality_owner  },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
                          <div style={{ fontSize: 13, color: value ? '#374151' : '#D1D5DB', marginTop: 1 }}>{value || '—'}</div>
                        </div>
                      ))}
                      {p.gamp5_category && (
                        <div>
                          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>GAMP 5</span>
                          <div style={{ fontSize: 13, color: '#374151', marginTop: 1 }}>{p.gamp5_category}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <button onClick={() => startEdit(p)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                        Edit
                      </button>
                      <button onClick={() => toggleActive(p)} disabled={saving} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: p.active ? '1px solid #BBF7D0' : '1px solid #E5E7EB', background: p.active ? '#F0FDF4' : '#F3F4F6', color: p.active ? '#166534' : '#6B7280' }}>
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isAdmin && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#92400E', marginTop: 16 }}>
          🔒 Only admins can manage products.
        </div>
      )}
    </div>
  );
}
