import express from 'express';
import { 
    loginAdmin, 
    appointmentsAdmin, 
    appointmentCancel, 
    addTreatment, 
    allTreatments, 
    adminDashboard, 
    deleteTreatment, 
    deleteAppointment, 
    completeAppointment, 
    getTreatment, 
    updateTreatment,
    adminRegisterUser,
    adminLoginUser,
    adminBookAppointment,
    acceptBalancePayment
} from '../controllers/adminController.js';
import { changeAvailablity } from '../controllers/treatmentController.js';
import authAdmin from '../middleware/authAdmin.js';
import upload from '../middleware/multer.js';
const adminRouter = express.Router();

adminRouter.post("/login", loginAdmin)
adminRouter.post("/add-treatment", authAdmin, upload.single('image'), addTreatment)
adminRouter.get("/appointments", authAdmin, appointmentsAdmin)
adminRouter.post("/cancel-appointment", authAdmin, appointmentCancel)
adminRouter.post("/complete-appointment", authAdmin, completeAppointment)
adminRouter.post("/delete-appointment", authAdmin, deleteAppointment)
adminRouter.get("/all-treatments", authAdmin, allTreatments)
adminRouter.post("/get-treatment", authAdmin, getTreatment)
adminRouter.post("/update-treatment", authAdmin, updateTreatment)
adminRouter.post("/change-availability", authAdmin, changeAvailablity)
adminRouter.get("/dashboard", authAdmin, adminDashboard)
adminRouter.post("/delete-treatment", authAdmin, deleteTreatment)

// New routes for managing user appointments
adminRouter.post("/register-user", authAdmin, adminRegisterUser)
adminRouter.post("/login-user", authAdmin, adminLoginUser)
adminRouter.post("/book-appointment", authAdmin, adminBookAppointment)
adminRouter.post("/accept-balance", authAdmin, acceptBalancePayment)

export default adminRouter;
