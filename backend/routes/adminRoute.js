import express from 'express';
import authAdmin from '../middleware/authAdmin.js';
import { 
    adminLogin, 
    adminRegister, 
    adminGetProfile, 
    adminUpdateProfile,
    adminGetDashData,
    adminGetAllAppointments,
    adminCancelAppointment,
    adminCompleteAppointment,
    adminDeleteAppointment,
    adminAcceptBalancePayment,
    creditUserAccount,
    deleteTreatment // Added new controller
} from '../controllers/adminController.js';

const adminRouter = express.Router();

adminRouter.post("/login", adminLogin);
adminRouter.post("/register", adminRegister);

adminRouter.get("/get-profile", authAdmin, adminGetProfile);
adminRouter.post("/update-profile", authAdmin, adminUpdateProfile);
adminRouter.get("/get-dash-data", authAdmin, adminGetDashData);
adminRouter.get("/get-all-appointments", authAdmin, adminGetAllAppointments);
adminRouter.post("/cancel-appointment", authAdmin, adminCancelAppointment);
adminRouter.post("/complete-appointment", authAdmin, adminCompleteAppointment);
adminRouter.post("/delete-appointment", authAdmin, adminDeleteAppointment);
adminRouter.post("/accept-balance-payment", authAdmin, adminAcceptBalancePayment);
adminRouter.post("/credit-user-account", authAdmin, creditUserAccount);
adminRouter.post("/delete-treatment", authAdmin, deleteTreatment); // Added new route

export default adminRouter;
