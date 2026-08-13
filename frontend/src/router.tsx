import { createBrowserRouter, Link } from 'react-router-dom';
import Layout from './components/Layout';
import { AdminOnly, ManagerOnly, RequireAuth } from './components/RequireAuth';
import { Button } from './components/ui';

import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import PosPage from './pages/PosPage';
import SalesPage from './pages/SalesPage';
import ProductsPage from './pages/ProductsPage';
import ProductUpsertPage from './pages/ProductUpsertPage';
import StockPage from './pages/StockPage';
import StockIntakePage from './pages/StockIntakePage';
import StockTakePage from './pages/StockTakePage';
import StockMovementsPage from './pages/StockMovementsPage';
import CustomersPage from './pages/invoicing/CustomersPage';
import CustomerUpsertPage from './pages/invoicing/CustomerUpsertPage';
import InvoicesPage from './pages/invoicing/InvoicesPage';
import InvoiceEditorPage from './pages/invoicing/InvoiceEditorPage';
import StatementPage from './pages/invoicing/StatementPage';
import SuppliersPage from './pages/suppliers/SuppliersPage';
import GoodsReceiptsPage from './pages/suppliers/GoodsReceiptsPage';
import GoodsReceiptEditorPage from './pages/suppliers/GoodsReceiptEditorPage';
import SupplierStatementPage from './pages/suppliers/SupplierStatementPage';
import ExpensesPage from './pages/ExpensesPage';
import ExpenseNewPage from './pages/ExpenseNewPage';
import PnlReportPage from './pages/reports/PnlReportPage';
import SalesReportPage from './pages/reports/SalesReportPage';
import StockReportPage from './pages/reports/StockReportPage';
import ZReportPage from './pages/reports/ZReportPage';
import LowStockReportPage from './pages/reports/LowStockReportPage';
import BranchesPage from './pages/BranchesPage';
import BranchUpsertPage from './pages/BranchUpsertPage';
import UsersPage from './pages/UsersPage';
import UserUpsertPage from './pages/UserUpsertPage';
import AuditLogPage from './pages/AuditLogPage';
import SyncTokensPage from './pages/SyncTokensPage';
import ReceiptSettingsPage from './pages/ReceiptSettingsPage';
import EmployeesPage from './pages/payroll/EmployeesPage';
import EmployeeUpsertPage from './pages/payroll/EmployeeUpsertPage';
import PayrollPage from './pages/payroll/PayrollPage';
import PayrollRunPage from './pages/payroll/PayrollRunPage';
import PayrollSettingsPage from './pages/payroll/PayrollSettingsPage';

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="text-5xl font-bold text-primary">404</div>
      <p className="text-sm text-muted-foreground">The page you’re looking for doesn’t exist.</p>
      <Link to="/dashboard">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <HomePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'pos', element: <PosPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'settings/receipt', element: <ReceiptSettingsPage /> },

          { path: 'products', element: <ProductsPage /> },
          { path: 'products/new', element: <ManagerOnly><ProductUpsertPage /></ManagerOnly> },
          { path: 'products/:id/edit', element: <ManagerOnly><ProductUpsertPage /></ManagerOnly> },

          { path: 'stock', element: <StockPage /> },
          { path: 'stock/intake', element: <StockIntakePage /> },
          { path: 'stock/take', element: <ManagerOnly><StockTakePage /></ManagerOnly> },
          { path: 'stock/movements', element: <ManagerOnly><StockMovementsPage /></ManagerOnly> },

          { path: 'customers', element: <ManagerOnly><CustomersPage /></ManagerOnly> },
          { path: 'customers/new', element: <ManagerOnly><CustomerUpsertPage /></ManagerOnly> },
          { path: 'customers/:id/edit', element: <ManagerOnly><CustomerUpsertPage /></ManagerOnly> },
          { path: 'customers/:id/statement', element: <ManagerOnly><StatementPage /></ManagerOnly> },
          { path: 'invoices', element: <ManagerOnly><InvoicesPage /></ManagerOnly> },
          { path: 'invoices/new', element: <ManagerOnly><InvoiceEditorPage /></ManagerOnly> },
          { path: 'invoices/:id', element: <ManagerOnly><InvoiceEditorPage /></ManagerOnly> },

          { path: 'suppliers', element: <ManagerOnly><SuppliersPage /></ManagerOnly> },
          { path: 'suppliers/:id/statement', element: <ManagerOnly><SupplierStatementPage /></ManagerOnly> },
          { path: 'goods-receipts', element: <ManagerOnly><GoodsReceiptsPage /></ManagerOnly> },
          { path: 'goods-receipts/new', element: <ManagerOnly><GoodsReceiptEditorPage /></ManagerOnly> },
          { path: 'goods-receipts/:id', element: <ManagerOnly><GoodsReceiptEditorPage /></ManagerOnly> },

          { path: 'expenses', element: <ManagerOnly><ExpensesPage /></ManagerOnly> },
          { path: 'expenses/new', element: <ManagerOnly><ExpenseNewPage /></ManagerOnly> },

          { path: 'reports/pnl', element: <ManagerOnly><PnlReportPage /></ManagerOnly> },
          { path: 'reports/sales', element: <ManagerOnly><SalesReportPage /></ManagerOnly> },
          { path: 'reports/stock', element: <ManagerOnly><StockReportPage /></ManagerOnly> },
          { path: 'reports/zreport', element: <ManagerOnly><ZReportPage /></ManagerOnly> },
          { path: 'reports/low-stock', element: <ManagerOnly><LowStockReportPage /></ManagerOnly> },

          { path: 'branches', element: <AdminOnly><BranchesPage /></AdminOnly> },
          { path: 'branches/new', element: <AdminOnly><BranchUpsertPage /></AdminOnly> },
          { path: 'branches/:id/edit', element: <AdminOnly><BranchUpsertPage /></AdminOnly> },

          { path: 'settings/users', element: <AdminOnly><UsersPage /></AdminOnly> },
          { path: 'settings/users/new', element: <AdminOnly><UserUpsertPage /></AdminOnly> },
          { path: 'settings/users/:id/edit', element: <AdminOnly><UserUpsertPage /></AdminOnly> },
          { path: 'settings/audit', element: <AdminOnly><AuditLogPage /></AdminOnly> },
          { path: 'settings/branch-sync', element: <AdminOnly><SyncTokensPage /></AdminOnly> },

          { path: 'people/employees', element: <AdminOnly><EmployeesPage /></AdminOnly> },
          { path: 'people/employees/new', element: <AdminOnly><EmployeeUpsertPage /></AdminOnly> },
          { path: 'people/employees/:id/edit', element: <AdminOnly><EmployeeUpsertPage /></AdminOnly> },
          { path: 'payroll', element: <AdminOnly><PayrollPage /></AdminOnly> },
          { path: 'payroll/:id', element: <AdminOnly><PayrollRunPage /></AdminOnly> },
          { path: 'settings/payroll', element: <AdminOnly><PayrollSettingsPage /></AdminOnly> },

          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
