import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, serverTimestamp, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

/** Default menu document ID under `menus/{id}` (items live in `menus/{id}/items`) */
const DEFAULT_MENU_ID = 'OQLY1DRSFXwlHHkNicAc';

const STORAGE_KEY_ORDERS = 'smartCafeOrders';

function readStoredOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrderToStorage(orderData) {
  try {
    const orders = readStoredOrders();
    // Add new order at the beginning
    const updatedOrders = [orderData, ...orders.filter(o => o.orderId !== orderData.orderId)];
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(updatedOrders));
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
            <div className="item-image-container">
              <div className="item-image">{item.image || '🍽️'}</div>
              {item.category && <span className="category-badge">{item.category}</span>}
            </div>
            <div className="item-info">
              <div className="item-header">
                <h3>{item.name || item.title}</h3>
              </div>
              <p className="description">{item.description}</p>
              <div className="item-footer">
                <div className="price-tag">
                  <span className="currency">PKR</span>
                  <span className="amount">{parseFloat(item.price ?? 0).toLocaleString()}</span>
                </div>
                <button className="add-btn" onClick={() => addToCart(item)}>
                  <span>Add</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrdersList() {
  const navigate = useNavigate();
  const orders = readStoredOrders();

  if (orders.length === 0) {
    return (
      <section className="orders-list-page">
        <div className="empty-state">
          <h2>No orders found</h2>
          <p>You haven't placed any orders yet.</p>
          <button className="order-success-btn-primary" onClick={() => navigate('/')}>
            Go to Menu
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="orders-list-page">
      <div className="orders-list-container">
        <div className="orders-list-header">
          <h1 className="orders-list-title">My Orders</h1>
          <button 
            className="order-success-btn-primary" 
            style={{ width: 'auto', minHeight: 'auto', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
            onClick={() => navigate('/')}
          >
            + New Order
          </button>
        </div>
        <div className="orders-grid">
          {orders.map((order) => (
            <div 
              key={order.orderId} 
              className="order-item-card"
              onClick={() => navigate(`/order/${order.orderId}`, { state: order })}
            >
              <div className="order-item-header">
                <h3>Order #{order.orderId.slice(-6).toUpperCase()}</h3>
                <span className={`status-badge ${(order.status || 'pending').toLowerCase()}`}>
                  {order.status}
                </span>
              </div>
              <p className="order-date">
                {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="order-summary-row">
                <span>{order.items.length} items</span>
                <span className="order-amount">PKR {order.total.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OrderDetailsScreen() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state || null);
  const [loading, setLoading] = useState(!order);

  useEffect(() => {
    if (!orderId) return;

    // First try to find in stored orders
    const stored = readStoredOrders().find(o => o.orderId === orderId);
    if (stored) {
      setOrder(stored);
      setLoading(false);
    }

    // Always fetch latest from Firebase to be sure
    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(orderRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const fullOrder = {
          orderId: docSnap.id,
          ...data,
          // Ensure it matches our format
          total: data.totalAmount || data.total || 0,
          items: data.items || [],
          createdAt: data.createdAtClient || (data.createdAt?.toDate?.()?.toISOString()) || new Date().toISOString()
        };
        setOrder(fullOrder);
        saveOrderToStorage(fullOrder);
        setLoading(false);
      } else if (!stored) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [orderId]);

  if (loading) return <div className="loading-state">Loading order details...</div>;

  if (!order) {
    return (
      <section className="order-success-page">
        <div className="empty-state">
          <h2>Order not found</h2>
          <p>We couldn't find the order you're looking for.</p>
          <button className="order-success-btn-primary" onClick={() => navigate('/orders')}>
            Back to Orders
          </button>
        </div>
      </section>
    );
  }

  const { items, total, status } = order;

  return (
    <section className="order-success-page" aria-labelledby="order-success-title">
      <div className="order-success-inner">
        <button className="back-link" onClick={() => navigate('/orders')}>
          ← Back to Orders
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
          <h1 id="order-success-title" className="order-success-heading" style={{ fontSize: '1.5rem', margin: 0 }}>
            Order Details
          </h1>
          <span className={`status-badge ${(status || 'pending').toLowerCase()}`}>
            {status}
          </span>
        </div>
        <p className="order-success-id">Order #{orderId}</p>

        <div className="order-success-summary">
          <h2 className="order-success-summary-title">Order Items</h2>
          <ul className="order-success-lines">
            {items.map((item, idx) => (
              <li key={idx} className="order-success-line">
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
            onClick={() => navigate(`/menu/${order.menuId || DEFAULT_MENU_ID}`)}
          >
            New Order
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
  const [hasLastOrder, setHasLastOrder] = useState(() => readStoredOrders().length > 0);
  const [lastOrderStatus, setLastOrderStatus] = useState(() => readStoredOrders()[0]?.status || 'pending');
  const [menuTitle, setMenuTitle] = useState('Smart Cafe');

  useEffect(() => {
    const fetchMenuTitle = async () => {
      if (!activeMenuId) {
        setMenuTitle('Smart Cafe');
        return;
      }
      try {
        const menuDocRef = doc(db, 'menus', activeMenuId);
        const menuDocSnap = await getDoc(menuDocRef);
        if (menuDocSnap.exists()) {
          setMenuTitle(menuDocSnap.data().title || menuDocSnap.data().name || 'Smart Cafe');
        } else {
          setMenuTitle('Smart Cafe');
        }
      } catch (err) {
        console.error("Error fetching menu title:", err);
        setMenuTitle('Smart Cafe');
      }
    };
    fetchMenuTitle();
  }, [activeMenuId]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setHasLastOrder(readStoredOrders().length > 0);
  }, [location.pathname]);

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
        createdAt: new Date().toISOString(),
      };
      saveOrderToStorage(orderPayload);
      setHasLastOrder(true);
      setLastOrderStatus('pending');
      setCart([]);
      setIsCartOpen(false);
      showToast('Order placed successfully! 🎉');
      navigate(`/order/${docRef.id}`, { state: orderPayload, replace: true });
    } catch (err) {
      console.error('Error saving order:', err);
      showToast('Could not save your order. Please try again.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const isOrderPage = location.pathname.startsWith('/order');

  const openOrdersList = () => {
    navigate('/orders');
  };

  return (
    <div className="app-container">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="header-content">
          <h1>{menuTitle}</h1>
          <div className="header-actions">
            {hasLastOrder && (
              <button
                type="button"
                className="header-icon-btn"
                onClick={openOrdersList}
                aria-label="View orders"
                title="My Orders"
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
            )}
            {!isOrderPage && (
              <button className="cart-toggle" onClick={() => setIsCartOpen(!isCartOpen)}>
                Cart ({cart.length})
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`main-content${isOrderPage ? ' main-content--success' : ''}`}>
        {!isOrderPage && (
          <section className="hero">
            <h2>Welcome to  {menuTitle} Menu</h2>
            <p>Freshly brewed coffee and delicious snacks delivered to your table.</p>
          </section>
        )}

        <Routes>
          <Route path="/menu/:menuId" element={<MenuList addToCart={addToCart} showToast={showToast} />} />
          <Route path="/orders" element={<OrdersList />} />
          <Route path="/order/:orderId" element={<OrderDetailsScreen />} />
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
