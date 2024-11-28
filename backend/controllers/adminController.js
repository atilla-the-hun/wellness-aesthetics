import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import appointmentModel from "../models/appointmentModel.js";
import treatmentModel from "../models/treatmentModel.js";
import bcrypt from "bcrypt";
import validator from "validator";
import userModel from "../models/userModel.js";

// Function to check if practitioner is available
const isPractitionerAvailable = async (practitioner, slotDate, startTime, duration) => {
    try {
        // Convert start time to minutes since midnight for easier comparison
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = startTimeInMinutes + parseInt(duration);

        // Get all non-cancelled appointments for this practitioner on this date
        const existingAppointments = await appointmentModel.find({
            practitioner,
            slotDate,
            cancelled: false
        });

        // Sort appointments by start time
        existingAppointments.sort((a, b) => {
            const [aHour, aMinute] = a.slotTime.split(':').map(Number);
            const [bHour, bMinute] = b.slotTime.split(':').map(Number);
            return (aHour * 60 + aMinute) - (bHour * 60 + bMinute);
        });

        // Check if the proposed slot would overlap with any existing appointments
        for (const appointment of existingAppointments) {
            const [bookedHour, bookedMinute] = appointment.slotTime.split(':').map(Number);
            const bookedStartTime = bookedHour * 60 + bookedMinute;
            const bookedEndTime = bookedStartTime + appointment.duration;

            // Check if this slot overlaps with the appointment
            if (
                (startTimeInMinutes >= bookedStartTime && startTimeInMinutes < bookedEndTime) ||
                (endTimeInMinutes > bookedStartTime && endTimeInMinutes <= bookedEndTime) ||
                (startTimeInMinutes <= bookedStartTime && endTimeInMinutes >= bookedEndTime)
            ) {
                return false;
            }

            // Check if there's enough break time after previous appointments
            if (startTimeInMinutes >= bookedEndTime && startTimeInMinutes < bookedEndTime + 15) {
                return false;
            }

            // Check if there's enough break time before next appointments
            if (endTimeInMinutes > bookedStartTime - 15 && endTimeInMinutes <= bookedStartTime) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Error checking practitioner availability:', error);
        throw error;
    }
};

// Function to update practitioner bookings
const updatePractitionerBookings = async (docId, practitioner, slotDate, slotTime) => {
    try {
        const treatment = await treatmentModel.findById(docId);
        if (!treatment.practitioner_bookings) {
            treatment.practitioner_bookings = {};
        }
        if (!treatment.practitioner_bookings[practitioner]) {
            treatment.practitioner_bookings[practitioner] = {};
        }
        if (!treatment.practitioner_bookings[practitioner][slotDate]) {
            treatment.practitioner_bookings[practitioner][slotDate] = [];
        }
        
        treatment.practitioner_bookings[practitioner][slotDate].push(slotTime);
        await treatment.save();
    } catch (error) {
        console.error('Error updating practitioner bookings:', error);
        throw new Error('Failed to update practitioner bookings');
    }
};

// API for admin login
const loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            const token = jwt.sign(
                { 
                    username,
                    isAdmin: true
                }, 
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: "Invalid credentials" });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for admin to register a user
const adminRegisterUser = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password || !phone) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" });
        }

        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" });
        }

        if (!validator.isMobilePhone(phone, 'any')) {
            return res.json({ success: false, message: "Please enter a valid phone number" });
        }

        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.json({ success: false, message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userData = {
            name,
            email,
            password: hashedPassword,
            phone,
        };

        const newUser = new userModel(userData);
        const user = await newUser.save();
        
        res.json({ success: true, userId: user._id, message: "User registered successfully" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for admin to login a user
const adminLoginUser = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User does not exist" });
        }

        res.json({ success: true, userId: user._id });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for admin to book appointment with cash/speed point payment
const adminBookAppointment = async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const { userId, docId, slotDate, slotTime, practitioner, duration, amount, paymentMethod, paymentType } = req.body;
        
        if (!paymentType || !['full', 'partial'].includes(paymentType)) {
            throw new Error('Invalid payment type. Must be "full" or "partial"');
        }

        if (!paymentMethod || !['cash', 'speed_point'].includes(paymentMethod)) {
            throw new Error('Invalid payment method. Must be "cash" or "speed_point"');
        }

        if (!duration || !amount) {
            throw new Error('Duration and amount are required');
        }

        // Check treatment availability
        const docData = await treatmentModel.findById(docId).select("-password").session(session);
        if (!docData || !docData.available) {
            throw new Error('Treatment Not Available');
        }

        // Check practitioner availability
        const isPractitionerFree = await isPractitionerAvailable(practitioner, slotDate, slotTime, duration);
        if (!isPractitionerFree) {
            throw new Error('Practitioner is not available for this time slot');
        }

        // Get user data
        const userData = await userModel.findById(userId).select("-password").session(session);
        if (!userData) {
            throw new Error('User not found');
        }

        // Generate booking number
        const bookingNumber = await appointmentModel.getNextBookingNumber();
        if (!bookingNumber) {
            throw new Error('Failed to generate booking number');
        }

        // Calculate payment amount
        const paymentAmount = paymentType === 'full' ? amount : amount / 2;

        // Create appointment with immediate payment
        const appointmentData = {
            userId,
            docId,
            userData,
            docData: { ...docData.toObject(), slots_booked: undefined },
            amount,
            duration,
            slotTime,
            slotDate,
            date: Date.now(),
            bookingNumber,
            paymentStatus: paymentType,
            paidAmount: paymentAmount,
            practitioner,
            transactionDetails: [{
                id: `${paymentMethod.toUpperCase()}_${Date.now()}`,
                status: 'COMPLETED',
                amount: paymentAmount,
                paymentType,
                paymentMethod,
                date: new Date()
            }]
        };

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save({ session });

        // Update practitioner bookings
        await updatePractitionerBookings(docId, practitioner, slotDate, slotTime);

        await session.commitTransaction();
        res.json({ 
            success: true, 
            message: 'Appointment Created and Payment Recorded',
            appointmentId: newAppointment._id
        });

    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        console.error('Booking Error:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to book appointment'
        });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// API for accepting balance payment
const acceptBalancePayment = async (req, res) => {
    try {
        const { appointmentId, paymentMethod } = req.body;

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' });
        }

        if (appointment.paymentStatus !== 'partial') {
            return res.json({ success: false, message: 'This appointment is not eligible for balance payment' });
        }

        const remainingBalance = appointment.amount - appointment.paidAmount;

        // Update appointment with full payment
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            paymentStatus: 'full',
            paidAmount: appointment.amount,
            $push: {
                transactionDetails: {
                    id: `${paymentMethod.toUpperCase()}_${Date.now()}`,
                    status: 'COMPLETED',
                    amount: remainingBalance,
                    paymentType: 'balance',
                    paymentMethod,
                    date: new Date()
                }
            }
        });

        res.json({ 
            success: true, 
            message: 'Balance payment accepted successfully'
        });

    } catch (error) {
        console.error('Balance Payment Error:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to process balance payment'
        });
    }
};

// API to get all appointments list
const appointmentsAdmin = async (req, res) => {
    try {
        const appointments = await appointmentModel.find({}).sort({ date: -1 });
        res.json({ success: true, appointments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for appointment cancellation
const appointmentCancel = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });
        res.json({ success: true, message: 'Appointment Cancelled' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for completing appointment
const completeAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndUpdate(appointmentId, { isCompleted: true });
        res.json({ success: true, message: 'Appointment Completed Successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for deleting appointment
const deleteAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        await appointmentModel.findByIdAndDelete(appointmentId);
        res.json({ success: true, message: 'Appointment Deleted Successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API for adding Treatment
const addTreatment = async (req, res) => {
    try {
        const { name, speciality, about, time_slots } = req.body;

        // checking for all data to add treatment
        if (!name || !speciality || !about || !time_slots) {
            return res.json({ success: false, message: "Missing Details" });
        }

        // Parse time_slots from JSON string to array
        const parsedTimeSlots = JSON.parse(time_slots);
        
        if (!Array.isArray(parsedTimeSlots) || parsedTimeSlots.length === 0) {
            return res.json({ success: false, message: "Invalid time slots" });
        }

        // Validate each time slot has duration and price
        const invalidSlots = parsedTimeSlots.filter(slot => !slot.duration || !slot.price || slot.price <= 0);
        if (invalidSlots.length > 0) {
            return res.json({ success: false, message: "Invalid time slot data" });
        }

        const treatmentData = {
            name,
            speciality,
            about,
            time_slots: parsedTimeSlots,
            date: Date.now()
        };

        const newTreatment = new treatmentModel(treatmentData);
        await newTreatment.save();
        res.json({ success: true, message: 'Treatment Added' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get all treatments list for admin panel
const allTreatments = async (req, res) => {
    try {
        const treatments = await treatmentModel.find({}).select('-password');
        res.json({ success: true, treatments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to delete treatment
const deleteTreatment = async (req, res) => {
    try {
        const { treatmentId } = req.body;
        await treatmentModel.findByIdAndDelete(treatmentId);
        res.json({ success: true, message: 'Treatment Deleted Successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get dashboard data for admin panel
const adminDashboard = async (req, res) => {
    try {
        const treatments = await treatmentModel.find({});
        const users = await userModel.find({});
        const appointments = await appointmentModel.find({}).sort({ date: -1 });

        const dashData = {
            treatments: treatments.length,
            appointments: appointments.length,
            patients: users.length,
            latestAppointments: appointments
        };

        res.json({ success: true, dashData });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get treatment data
const getTreatment = async (req, res) => {
    try {
        const { treatmentId } = req.body;
        const treatment = await treatmentModel.findById(treatmentId).select('-password');
        res.json({ success: true, treatment });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to update treatment
const updateTreatment = async (req, res) => {
    try {
        const { treatmentId, name, speciality, about, time_slots, available } = req.body;

        // Create update object with required fields
        const updateData = {
            name,
            speciality,
            about,
            available
        };

        // Handle time_slots if provided
        if (time_slots) {
            try {
                const parsedTimeSlots = JSON.parse(time_slots);
                
                // Validate time slots array
                if (!Array.isArray(parsedTimeSlots)) {
                    return res.json({ success: false, message: "Time slots must be an array" });
                }

                // Validate each time slot
                for (const slot of parsedTimeSlots) {
                    if (!slot.duration || !slot.price) {
                        return res.json({ success: false, message: "Each time slot must have duration and price" });
                    }
                    if (slot.price <= 0) {
                        return res.json({ success: false, message: "Price must be greater than 0" });
                    }
                    if (slot.duration <= 0) {
                        return res.json({ success: false, message: "Duration must be greater than 0" });
                    }
                }

                updateData.time_slots = parsedTimeSlots;
            } catch (error) {
                return res.json({ success: false, message: "Invalid time slots format" });
            }
        }

        // Update the treatment
        await treatmentModel.findByIdAndUpdate(treatmentId, updateData);
        res.json({ success: true, message: 'Treatment Updated Successfully' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export {
    loginAdmin,
    appointmentsAdmin,
    appointmentCancel,
    completeAppointment,
    deleteAppointment,
    addTreatment,
    allTreatments,
    adminDashboard,
    deleteTreatment,
    getTreatment,
    updateTreatment,
    adminRegisterUser,
    adminLoginUser,
    adminBookAppointment,
    acceptBalancePayment
};
