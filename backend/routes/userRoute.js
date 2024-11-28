import express from 'express';
import { 
    loginUser, 
    registerUser, 
    getProfile, 
    updateProfile, 
    bookAppointment, 
    listAppointment, 
    cancelAppointment, 
    paymentPayPal, 
    verifyPayPal, 
    paymentPayFast, 
    verifyPayFast,
    checkPractitionerAvailability 
} from '../controllers/userController.js';
import upload from '../middleware/multer.js';
import authUser from '../middleware/authUser.js';
const userRouter = express.Router();

userRouter.post("/register", registerUser)
userRouter.post("/login", loginUser)

userRouter.get("/get-profile", authUser, getProfile)
userRouter.post("/update-profile", upload.single('image'), authUser, updateProfile)
userRouter.post("/book-appointment", authUser, bookAppointment)
userRouter.get("/appointments", authUser, listAppointment)
userRouter.post("/cancel-appointment", authUser, cancelAppointment)

// Practitioner availability check
userRouter.post("/check-practitioner-availability", checkPractitionerAvailability)

// PayPal routes
userRouter.post("/payment-paypal", authUser, paymentPayPal)
userRouter.post("/verifyPayPal", authUser, verifyPayPal)

// PayFast routes
userRouter.post("/payment-payfast", authUser, paymentPayFast)
userRouter.post("/verifyPayFast", authUser, verifyPayFast)
userRouter.post("/payfast-notify", verifyPayFast)

export default userRouter;