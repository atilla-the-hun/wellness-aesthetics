import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import appointmentModel from "../models/appointmentModel.js";
import treatmentModel from "../models/treatmentModel.js";

// API to login admin
const adminLogin = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check for either username or email
        if ((!username && !email) || !password) {
            return res.json({ success: false, message: "Missing Details" });
        }

        // Check against environment variables
        const adminUsername = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if ((username !== adminUsername && email !== adminUsername) || password !== adminPassword) {
            return res.json({ success: false, message: "Invalid Credentials" });
        }

        // Include isAdmin in the token
        const token = jwt.sign({ 
            id: "admin",
            isAdmin: true 
        }, process.env.JWT_SECRET);

        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to register admin
const adminRegister = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({ success: false, message: "Missing Details" });
        }

        const token = jwt.sign({ id: "admin", isAdmin: true }, process.env.JWT_SECRET);
        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get admin profile data
const adminGetProfile = async (req, res) => {
    try {
        res.json({ success: true });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to update admin profile
const adminUpdateProfile = async (req, res) => {
    try {
        res.json({ success: true });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get dashboard data
const adminGetDashData = async (req, res) => {
    try {
        const treatments = await treatmentModel.countDocuments();
        const appointments = await appointmentModel.countDocuments();
        const patients = await userModel.countDocuments();
        const latestAppointments = await appointmentModel.find()
            .populate('userData')
            .populate('docData')
            .sort({ date: -1 });

        res.json({
            success: true,
            treatments,
            appointments,
            patients,
            latestAppointments
        });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get all appointments
const adminGetAllAppointments = async (req, res) => {
    try {
        const appointments = await appointmentModel.find().sort({ date: -1 });
        res.json({ success: true, appointments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to cancel appointment
const adminCancelAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });
        res.json({ success: true, message: 'Appointment Cancelled' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to complete appointment
const adminCompleteAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndUpdate(appointmentId, { isCompleted: true });
        res.json({ success: true, message: 'Appointment Completed' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to delete appointment
const adminDeleteAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndDelete(appointmentId);
        res.json({ success: true, message: 'Appointment Deleted' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to accept balance payment
const adminAcceptBalancePayment = async (req, res) => {
    try {
        const { appointmentId, paymentMethod } = req.body;
        const appointment = await appointmentModel.findById(appointmentId);

        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' });
        }

        const remainingBalance = appointment.amount - appointment.paidAmount;
        const newPaidAmount = appointment.paidAmount + remainingBalance;

        await appointmentModel.findByIdAndUpdate(appointmentId, {
            paymentStatus: 'full',
            paidAmount: newPaidAmount,
            $push: {
                transactionDetails: {
                    id: `BALANCE_${Date.now()}`,
                    status: 'COMPLETE',
                    amount: remainingBalance,
                    paymentType: 'balance',
                    paymentMethod,
                    date: new Date()
                }
            }
        });

        res.json({ success: true, message: 'Balance payment accepted' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to credit user's account
const creditUserAccount = async (req, res) => {
    try {
        const { userId, amount, appointmentId } = req.body;

        // Validate inputs
        if (!userId || !amount || !appointmentId) {
            return res.json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        // Convert amount to number and validate
        const creditAmount = Number(amount);
        if (isNaN(creditAmount) || creditAmount <= 0) {
            return res.json({
                success: false,
                message: 'Invalid credit amount'
            });
        }

        // Find user
        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Calculate new balance
        const newBalance = (user.creditBalance || 0) + creditAmount;

        // Create credit transaction object
        const creditTransaction = {
            amount: creditAmount,
            type: 'credit',
            appointmentId: appointmentId.toString(),
            date: new Date(),
            description: 'Credit from cancelled appointment'
        };

        try {
            // Create transaction detail for the appointment
            const transactionDetail = {
                id: `CREDIT_REFUND_${Date.now()}`,
                status: 'COMPLETE',
                amount: creditAmount,
                paymentType: 'credit_refund',
                paymentMethod: 'admin_credit',
                date: new Date(),
                description: 'Credited to user account'
            };

            // Update user with new balance and credit history
            await userModel.findByIdAndUpdate(userId, {
                creditBalance: newBalance,
                $push: { creditHistory: creditTransaction }
            }, { runValidators: true });

            // Update appointment to mark credit as processed and add transaction detail
            await appointmentModel.findByIdAndUpdate(appointmentId, {
                creditProcessed: true,
                $push: { transactionDetails: transactionDetail }
            });

            res.json({ 
                success: true, 
                message: `Successfully credited ${creditAmount} to user's account`,
                newBalance
            });
        } catch (updateError) {
            console.error('Update Error:', updateError);
            res.json({ 
                success: false, 
                message: 'Error updating user credit: ' + updateError.message 
            });
        }

    } catch (error) {
        console.error('Credit User Account Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
};

// API to delete treatment
const deleteTreatment = async (req, res) => {
    try {
        const { treatmentId } = req.body;

        // Check if there are any appointments for this treatment
        const appointments = await appointmentModel.find({ docId: treatmentId });
        if (appointments.length > 0) {
            return res.json({ 
                success: false, 
                message: 'Cannot delete treatment with existing appointments' 
            });
        }

        // Delete the treatment
        await treatmentModel.findByIdAndDelete(treatmentId);
        
        res.json({ 
            success: true, 
            message: 'Treatment deleted successfully' 
        });

    } catch (error) {
        console.log(error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
};

export {
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
    deleteTreatment
};
