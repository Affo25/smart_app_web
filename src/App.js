import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, serverTimestamp, onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

/** Default menu document ID under `menus/{id}` (items live in `menus/{id}/items`) */
const DEFAULT_MENU_ID = 'OQLY1DRSFXwlHHkNicAc';

const STORAGE_KEY_LAST_ORDER = 'smartCafeLastOrder';

function readStoredOrderPayload() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_LAST_ORDER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.orderId ? parsed : null;
  } catch {
    return null;
  }
}

function persistLastOrderPayload(payload) {
  try {
    sessionStorage.setItem(STORAGE_KEY_LAST_ORDER, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/** `menuId` from `/menu/:menuId` or `?menuId=` (path wins if both present). */
function getMenuIdFromUrl(pathname, search) {
  const fromPath = pathname.match(/^\/menu\/([^/]+)/);
  if (fromPath) {
    try {
      return decodeURIComponent(fromPath[1]);
    } catch {
      return fromPath[1];
    }
  }
  const q = new URLSearchParams(search).get('menuId');
  return q != null && String(q).trim() !== '' ? String(q).trim() : '';
}

function buildOrderPayload(cart, menuId, totalAmount) {
  const items = cart.map((item) => {
    const name = item.name || item.title || '';
    const price = Number(item.price) || 0;
    const quantity = item.quantity || 1;
    return {
      category: item.category || 'General',
      image: item.image || '',
      itemId: item.itemId || name,
      lineTotal: price * quantity,
      name,
      price,
      quantity,
    };
  });
  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return {
    createdAt: serverTimestamp(),
    createdAtClient: new Date().toISOString(),
    items,
    menuId: menuId || '',
    menuTitle: '',
    status: 'pending',
    totalAmount,
    totalItems,
    userEmail: '',
    userId: '',
  };
}

// Component for the Menu List
function MenuList({ addToCart, showToast }) {
  const { menuId } = useParams();
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMenu = async () => {
      if (!menuId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const itemsRef = collection(db, 'menus', menuId, 'items');
        const querySnapshot = await getDocs(itemsRef);

        const items = [];
        querySnapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        setMenuItems(items);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching menu:", err);
        setError("Failed to load menu. Please check your Firebase configuration.");
        setLoading(false);
      }
    };

    fetchMenu();
  }, [menuId]);

  if (loading) return <div className="loading-state">Loading your menu...</div>;
  if (error) return <div className="error-state">{error}</div>;
  if (menuItems.length === 0) return <div className="empty-state">No items found for this menu ID ({menuId}).</div>;

  return (
    <section className="menu-section">
      <div className="menu-grid">
        {menuItems.map(item => (
          <div key={item.id} className="menu-card">
            <div className="item-image">{item.image || '🍽️'}</div>
            <div className="item-info">
              <h3>{item.name || item.title}</h3>
              <p className="description">{item.description}</p>
              <div className="item-footer">
                <span className="price">PKR {parseFloat(item.price ?? 0).toFixed(2)}</span>
                <button className="add-btn" onClick={() => addToCart(item)}>Add to Order</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrderSuccessScreen({ lastOrderStatus }) {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state?.orderId ? location.state : readStoredOrderPayload();

  if (!data?.orderId) {
    return <Navigate to={`/menu/${DEFAULT_MENU_ID}`} replace />;
  }

  const { orderId, items, total, menuId } = data;
  const backMenuPath = `/menu/${menuId || DEFAULT_MENU_ID}`;

  // Use lastOrderStatus if it's available and refers to the same order we are viewing
  const displayStatus = (lastOrderStatus && data.orderId === readStoredOrderPayload()?.orderId) 
    ? lastOrderStatus 
    : data.status;

  return (
    <section className="order-success-page" aria-labelledby="order-success-title">
      <div className="order-success-inner">
        <div className="order-success-badge" aria-hidden>✓</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <h1 id="order-success-title" className="order-success-heading" style={{ fontSize: '1.5rem', margin: 0 }}>
            Order Details
          </h1>
          <span className={`status-badge ${(displayStatus || 'pending').toLowerCase()}`}>
            {displayStatus}
          </span>
        </div>
        <p className="order-success-id">Order #{orderId}</p>
{/* 
        <div className="order-success-delivery">
          <span className="order-success-delivery-icon" aria-hidden>🕒</span>
          <div className="order-success-delivery-text">
            <p className="order-success-delivery-title">Estimated delivery</p>
            <p className="order-success-delivery-time">Your order will arrive in about <strong>30 minutes</strong>.</p>
            <p className="order-success-delivery-note">
              We will prepare your items fresh and bring them to your table.
            </p>
          </div>
        </div> */}

        <div className="order-success-summary">
          <h2 className="order-success-summary-title">Your order</h2>
          <ul className="order-success-lines">
            {items.map((item) => (
              <li key={item.id} className="order-success-line">
                <span>
                  {item.quantity}× {item.name || item.title}
                </span>
                <span>PKR {(item.price * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="order-success-total">
            <span>Total</span>
            <span>PKR {total.toFixed(2)}</span>
          </div>
        </div>

        <div className="order-success-actions">
          <button
            type="button"
            className="order-success-btn-primary"
            onClick={() => navigate(backMenuPath, { replace: true })}
          >
            New order
          </button>
        </div>
      </div>
    </section>
  );
}

function MainApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeMenuId = useMemo(
    () => getMenuIdFromUrl(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [hasLastOrder, setHasLastOrder] = useState(() => !!readStoredOrderPayload());
  const [lastOrderStatus, setLastOrderStatus] = useState(() => readStoredOrderPayload()?.status || 'pending');

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!hasLastOrder) return;

    const stored = readStoredOrderPayload();
    if (!stored?.orderId) return;

    const orderRef = doc(db, 'orders', stored.orderId);
    const unsubscribe = onSnapshot(orderRef, (docSnap) => {
      if (docSnap.exists()) {
        const newData = docSnap.data();
        const currentStored = readStoredOrderPayload();
        
        // Update local status state
        setLastOrderStatus(newData.status);

        // Only show toast and update storage if status actually changed
        if (currentStored && newData.status !== currentStored.status) {
          showToast(`Order status updated to: ${newData.status}`);
          persistLastOrderPayload({ ...currentStored, status: newData.status });
          
          // Force a state update if we're on the success screen to reflect the new status
          if (location.pathname === '/order-success') {
            navigate('/order-success', { 
              state: { ...currentStored, status: newData.status }, 
              replace: true 
            });
          }
        }
      }
    });

    return () => unsubscribe();
  }, [hasLastOrder, location.pathname, navigate]);

  const addToCart = (item) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(i => i.id === item.id);
      if (existingItem) {
        return prevCart.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
    showToast(`${item.name || item.title} added to cart!`);
  };

  const removeFromCart = (itemId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId, delta) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || orderSubmitting) return;

    setOrderSubmitting(true);
    try {
      const payload = buildOrderPayload(cart, activeMenuId, totalAmount);
      const docRef = await addDoc(collection(db, 'orders'), payload);

      const orderPayload = {
        orderId: docRef.id,
        items: [...cart],
        total: totalAmount,
        menuId: activeMenuId || DEFAULT_MENU_ID,
        status: 'pending',
      };
      persistLastOrderPayload(orderPayload);
      setHasLastOrder(true);
      setLastOrderStatus('pending');
      setCart([]);
      setIsCartOpen(false);
      showToast('Order placed successfully! 🎉');
      navigate('/order-success', { state: orderPayload, replace: true });
    } catch (err) {
      console.error('Error saving order:', err);
      showToast('Could not save your order. Please try again.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const isOrderSuccess = location.pathname === '/order-success';

  const openOrderDetails = () => {
    const payload = readStoredOrderPayload();
    if (!payload?.orderId) {
      showToast('No order yet. Place an order to see details here.');
      return;
    }
    navigate('/order-success', { state: payload });
  };

  return (
    <div className="app-container">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="header-content">
          <h1>Smart Cafe</h1>
          <div className="header-actions">
            {hasLastOrder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`status-badge ${(lastOrderStatus || 'pending').toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                  {lastOrderStatus}
                </span>
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={openOrderDetails}
                  aria-label="View order details"
                  title="Order details"
                >
                  <svg
                    className="header-icon-svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
            {!isOrderSuccess && (
              <button className="cart-toggle" onClick={() => setIsCartOpen(!isCartOpen)}>
                Cart ({cart.length})
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`main-content${isOrderSuccess ? ' main-content--success' : ''}`}>
        {!isOrderSuccess && (
          <section className="hero">
            <h2>Welcome to Smart Cafe</h2>
            <p>Freshly brewed coffee and delicious snacks delivered to your table.</p>
          </section>
        )}

        <Routes>
          <Route path="/menu/:menuId" element={<MenuList addToCart={addToCart} showToast={showToast} />} />
          <Route path="/order-success" element={<OrderSuccessScreen lastOrderStatus={lastOrderStatus} />} />
          <Route path="/" element={<Navigate to={`/menu/${DEFAULT_MENU_ID}`} replace />} />
        </Routes>
      </main>

      {/* Cart Sidebar */}
      {isCartOpen && (
        <aside className="cart-sidebar">
          <div className="cart-header">
            <h2>Your Order</h2>
            <button className="close-btn" onClick={() => setIsCartOpen(false)}>&times;</button>
          </div>
          <div className="cart-items">
            {cart.length === 0 ? (
              <p className="empty-msg">Your cart is empty.</p>
            ) : (
              cart.map(item => (
                <div key={item.id} className="cart-item">
                  <div className="cart-item-info">
                    <h4>{item.name || item.title}</h4>
                    <span>PKR {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  <div className="cart-item-actions">
                    <button onClick={() => updateQuantity(item.id, -1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)}>+</button>
                    <button className="remove-btn" onClick={() => removeFromCart(item.id)}>Remove</button>
                  </div>
                </div>
              ))
            )}
          </div>
          {cart.length > 0 && (
            <div className="cart-footer">
              <div className="total">
                <span>Total:</span>
                <span>PKR {totalAmount.toFixed(2)}</span>
              </div>
              <button
                className="checkout-btn"
                onClick={handlePlaceOrder}
                disabled={orderSubmitting}
              >
                {orderSubmitting ? 'Placing…' : 'Place Order'}
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <MainApp />
    </Router>
  );
}

export default App;
