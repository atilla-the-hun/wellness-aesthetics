import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import mongoose from "mongoose";
import treatmentModel from "../models/treatmentModel.js";
import appointmentModel from "../models/appointmentModel.js";
import { v2 as cloudinary } from 'cloudinary';
import fetch from 'node-fetch';
import crypto from 'crypto';

// PayFast API Configuration
const PAYFAST_API = process.env.PAYFAST_SANDBOX === 'true' 
    ? 'https://sandbox.payfast.co.za'
    : 'https://www.payfast.co.za';

// Function to generate PayFast signature
const generatePayFastSignature = (data, passPhrase = null) => {
    // Create parameter string
    let pfOutput = '';
    for (let key in data) {
        if(data.hasOwnProperty(key)) {
            if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
                const value = String(data[key]).trim();
                pfOutput +=`${key}=${encodeURIComponent(value).replace(/%20/g, "+")}&`
            }
        }
    }

    // Remove last & from string
    let getString = pfOutput.slice(0, -1);
    if (passPhrase !== null && passPhrase !== undefined) {
        getString +=`&passphrase=${encodeURIComponent(String(passPhrase).trim()).replace(/%20/g, "+")}`;
    }

    return crypto.createHash('md5').update(getString).digest('hex');
};

// Function to check if practitioner is available
const isPractitionerAvailable = async (practitioner, slotDate, startTime, duration) => {
    try {
        console.log('Checking availability for:', { practitioner, slotDate, startTime, duration });

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

        console.log('Existing appointments:', existingAppointments);

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
            const bookedEndTime = bookedStartTime + parseInt(appointment.duration);

            console.log('Checking overlap with appointment:', {
                appointmentTime: appointment.slotTime,
                bookedStartTime,
                bookedEndTime,
                proposedStartTime: startTimeInMinutes,
                proposedEndTime: endTimeInMinutes
            });

            // Check if this slot overlaps with the appointment
            if (
                (startTimeInMinutes >= bookedStartTime && startTimeInMinutes < bookedEndTime) ||
                (endTimeInMinutes > bookedStartTime && endTimeInMinutes <= bookedEndTime) ||
                (startTimeInMinutes <= bookedStartTime && endTimeInMinutes >= bookedEndTime)
            ) {
                console.log('Slot overlaps with existing appointment');
                return false;
            }

            // Check if there's enough break time after previous appointments
            if (startTimeInMinutes >= bookedEndTime && startTimeInMinutes < bookedEndTime + 15) {
                console.log('Not enough break time after previous appointment');
                return false;
            }

            // Check if there's enough break time before next appointments
            if (endTimeInMinutes > bookedStartTime - 15 && endTimeInMinutes <= bookedStartTime) {
                console.log('Not enough break time before next appointment');
                return false;
            }
        }

        console.log('Slot is available');
        return true;
    } catch (error) {
        console.error('Error checking practitioner availability:', error);
        throw error;
    }
};

// API to check practitioner availability
const checkPractitionerAvailability = async (req, res) => {
    try {
        const { practitioner, slotDate, slotTime, duration } = req.body;
        console.log('Received availability check request:', { practitioner, slotDate, slotTime, duration });

        if (!practitioner || !slotDate || !slotTime || !duration) {
            return res.json({ success: false, message: 'Missing required fields' });
        }

        const isAvailable = await isPractitionerAvailable(practitioner, slotDate, slotTime, duration);

        res.json({ 
            success: true, 
            available: isAvailable 
        });

    } catch (error) {
        console.error('Error checking practitioner availability:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to check practitioner availability'
        });
    }
};

// API to register user
const registerUser = async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        // Convert phone and name to lowercase for case-insensitive comparison
        const lowerPhone = phone.toLowerCase();
        const lowerName = name.toLowerCase();

        // Check if user already exists with this phone number
        const existingUser = await userModel.findOne({ 
            phone: { $regex: new RegExp('^' + lowerPhone + '$', 'i') } 
        });

        if (existingUser) {
            return res.json({ success: false, message: "User already exists with this phone number" });
        }

        const userData = {
            name: lowerName,
            phone: lowerPhone,
            creditBalance: 0,
            creditHistory: []
        };

        const newUser = new userModel(userData);
        const user = await newUser.save();
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to login user
const loginUser = async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.json({ success: false, message: "Missing Details" });
        }

        // Convert to lowercase for case-insensitive comparison
        const lowerPhone = phone.toLowerCase();
        const lowerName = name.toLowerCase();

        // Find user with case-insensitive matching of both name and phone
        const user = await userModel.findOne({
            name: { $regex: new RegExp('^' + lowerName + '$', 'i') },
            phone: { $regex: new RegExp('^' + lowerPhone + '$', 'i') }
        });

        if (!user) {
            return res.json({ success: false, message: "User not found. Please check your name and phone number" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get user profile data
const getProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        const userData = await userModel.findById(userId);
        res.json({ success: true, userData });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to update user profile
const updateProfile = async (req, res) => {
    try {
        const { userId, name, phone, address, dob, gender } = req.body;
        const imageFile = req.file;

        if (!name || !phone || !dob || !gender) {
            return res.json({ success: false, message: "Data Missing" });
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address: JSON.parse(address), dob, gender });

        if (imageFile) {
            // Create a dataURI from the buffer for Cloudinary
            const dataUri = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`;
            
            // Upload to Cloudinary using the dataURI
            const imageUpload = await cloudinary.uploader.upload(dataUri, { 
                resource_type: "image",
                folder: "user_profiles" 
            });
            
            const imageURL = imageUpload.secure_url;
            await userModel.findByIdAndUpdate(userId, { image: imageURL });
        }

        res.json({ success: true, message: 'Profile Updated' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to book appointment 
const bookAppointment = async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const { userId, docId, slotDate, slotTime, paymentType, practitioner, duration, amount, useCredit } = req.body;
        console.log('Received booking request:', { userId, docId, slotDate, slotTime, paymentType, practitioner, duration, amount, useCredit });
        
        if (!paymentType || !['full', 'partial'].includes(paymentType)) {
            throw new Error('Invalid payment type. Must be "full" or "partial"');
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

        // Calculate required payment amount based on payment type
        const totalAmount = amount;
        const requiredAmount = paymentType === 'partial' ? totalAmount / 2 : totalAmount;
        let creditUsed = 0;
        let remainingPayment = requiredAmount;

        // Initialize transaction details array
        let transactionDetails = [];

        // Handle credit usage if requested
        if (useCredit && userData.creditBalance > 0) {
            creditUsed = Math.min(userData.creditBalance, requiredAmount);
            remainingPayment = requiredAmount - creditUsed;

            // Add credit transaction to the array
            if (creditUsed > 0) {
                transactionDetails.push({
                    id: `CREDIT_${Date.now()}`,
                    status: 'COMPLETE',
                    amount: creditUsed,
                    paymentType: paymentType, // Use the original payment type (partial/full)
                    paymentMethod: 'credit_balance',
                    date: new Date()
                });
            }

            // Update user's credit balance
            await userModel.findByIdAndUpdate(userId, {
                $inc: { creditBalance: -creditUsed },
                $push: {
                    creditHistory: {
                        amount: -creditUsed,
                        type: 'debit',
                        appointmentId: null, // Will be updated after appointment creation
                        date: new Date(),
                        description: 'Used for new appointment'
                    }
                }
            }, { session });
        }

        // Generate booking number
        const bookingNumber = await appointmentModel.getNextBookingNumber();
        if (!bookingNumber) {
            throw new Error('Failed to generate booking number');
        }

        // Determine payment status based on payment type and amount paid
        let paymentStatus;
        if (paymentType === 'partial') {
            // For partial payments, only mark as partial if credit covers half the total amount
            paymentStatus = creditUsed >= totalAmount / 2 ? 'partial' : 'none';
        } else {
            // For full payments, only mark as full if credit covers the total amount
            paymentStatus = creditUsed >= totalAmount ? 'full' : 'none';
        }

        // Create appointment
        const appointmentData = {
            userId,
            docId,
            userData,
            docData: { ...docData.toObject(), slots_booked: undefined },
            amount: totalAmount,
            duration,
            slotTime,
            slotDate,
            date: Date.now(),
            bookingNumber,
            paymentStatus,
            paidAmount: creditUsed,
            practitioner,
            creditUsed,
            transactionDetails
        };

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save({ session });

        // Update credit history with appointment ID if credit was used
        if (creditUsed > 0) {
            await userModel.updateOne(
                { _id: userId, "creditHistory.appointmentId": null },
                { $set: { "creditHistory.$.appointmentId": newAppointment._id } },
                { session }
            );
        }

        await session.commitTransaction();
        res.json({ 
            success: true, 
            message: 'Appointment Created',
            appointmentId: newAppointment._id,
            remainingPayment
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

// API to cancel appointment
const cancelAppointment = async (req, res) => {
    try {
        const { userId, appointmentId } = req.body;
        const appointmentData = await appointmentModel.findById(appointmentId);

        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Unauthorized action' });
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });
        res.json({ success: true, message: 'Appointment Cancelled' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get user appointments
const listAppointment = async (req, res) => {
    try {
        const { userId } = req.body;
        const appointments = await appointmentModel.find({ userId }).sort({ date: -1 });
        res.json({ success: true, appointments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to make payment of appointment using PayFast
const paymentPayFast = async (req, res) => {
    try {
        const { appointmentId, paymentType, amount } = req.body;
        const { origin } = req.headers;

        const appointmentData = await appointmentModel.findById(appointmentId);

        if (!appointmentData || appointmentData.cancelled) {
            return res.json({ success: false, message: 'Appointment Cancelled or not found' });
        }

        // Use the provided amount (which has already been adjusted for credit)
        // or calculate based on remaining balance
        const paymentAmount = amount || (paymentType === 'full' ? 
            (appointmentData.amount - appointmentData.paidAmount) : 
            (appointmentData.amount / 2 - appointmentData.paidAmount));

        // Store payment details in the appointment for later verification
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            pendingPayment: {
                amount: paymentAmount,
                paymentType,
                timestamp: new Date()
            }
        });

        // Generate a unique payment ID
        const pfPaymentId = `PF_${Date.now()}_${appointmentId}`;

        // Prepare PayFast payment data
        const paymentData = {
            merchant_id: process.env.PAYFAST_MERCHANT_ID || '',
            merchant_key: process.env.PAYFAST_MERCHANT_KEY || '',
            return_url: `${origin}/verify?success=true&appointmentId=${appointmentData._id}&payfast=true&pfPaymentId=${pfPaymentId}`,
            cancel_url: `${origin}/verify?success=false&appointmentId=${appointmentData._id}&payfast=true`,
            notify_url: `${origin}/api/user/payfast-notify`,
            name_first: appointmentData.userData.name || '',
            email_address: appointmentData.userData.email || '',
            m_payment_id: pfPaymentId,
            amount: paymentAmount.toFixed(2),
            item_name: `${appointmentData.docData.name} - Booking #${appointmentData.bookingNumber}`,
            custom_str1: JSON.stringify({
                appointmentId: appointmentData._id.toString(),
                paymentType,
                amount: paymentAmount
            })
        };

        // Generate signature with null check for passphrase
        const signature = generatePayFastSignature(paymentData, process.env.PAYFAST_PASSPHRASE || null);
        paymentData.signature = signature;

        res.json({ 
            success: true,
            paymentData,
            payfast_url: `${PAYFAST_API}/eng/process`
        });

    } catch (error) {
        console.error('PayFast Payment Error:', error);
        res.json({ success: false, message: error.message });
    }
};

// API to verify PayFast payment
const verifyPayFast = async (req, res) => {
    try {
        const { appointmentId, success } = req.body;
        
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: 'Appointment not found' });
        }

        // If payment was cancelled (success=false in query params)
        if (success === false) {
            // Only reset payment status if it's a first-time payment (status is 'none')
            if (appointment.paymentStatus === 'none') {
                // Reset the pending payment and mark as cancelled at checkout
                await appointmentModel.findByIdAndUpdate(appointmentId, {
                    pendingPayment: null,
                    cancelled: true,
                    cancelledAtCheckout: true,
                    paymentStatus: 'none',
                    paidAmount: 0
                });
            } else {
                // For appointments with existing payments, just clear pending payment
                await appointmentModel.findByIdAndUpdate(appointmentId, {
                    pendingPayment: null
                });
            }
            
            return res.json({
                success: true,
                message: appointment.paymentStatus === 'none' ? 
                    'Payment cancelled and appointment cancelled' : 
                    'Additional payment cancelled',
                paymentStatus: appointment.paymentStatus
            });
        }

        // In sandbox mode or handling successful payment
        if (process.env.PAYFAST_SANDBOX === 'true' || success === true) {
            const pendingPayment = appointment.pendingPayment;
            if (!pendingPayment) {
                return res.json({ success: false, message: 'No pending payment found' });
            }

            // Calculate new paid amount
            const currentPaidAmount = appointment.paidAmount || 0;
            const newPaidAmount = currentPaidAmount + pendingPayment.amount;
            const totalAmount = appointment.amount;

            // Determine new payment status based on total amount and payment type
            let newPaymentStatus;
            if (pendingPayment.paymentType === 'partial') {
                // For partial payments, check if at least half is paid
                newPaymentStatus = newPaidAmount >= totalAmount / 2 ? 'partial' : 'none';
            } else {
                // For full payments, check if total amount is paid
                newPaymentStatus = newPaidAmount >= totalAmount ? 'full' : 'partial';
            }

            // Create transaction detail for PayFast payment
            const transactionDetail = {
                id: `PAYFAST_${Date.now()}`,
                status: 'COMPLETE',
                amount: pendingPayment.amount,
                paymentType: pendingPayment.paymentType,
                paymentMethod: 'payfast',
                date: new Date()
            };

            // Update appointment with new payment details
            await appointmentModel.findByIdAndUpdate(
                appointmentId,
                {
                    paymentStatus: newPaymentStatus,
                    paidAmount: newPaidAmount,
                    pendingPayment: null,
                    $push: { transactionDetails: transactionDetail }
                }
            );

            return res.json({ 
                success: true, 
                message: 'Payment verified successfully',
                paymentStatus: newPaymentStatus
            });
        }

        res.json({ success: false, message: 'Payment not completed' });

    } catch (error) {
        console.error('PayFast Verification Error:', error);
        res.json({ success: false, message: error.message });
    }
};

export {
    loginUser,
    registerUser,
    getProfile,
    updateProfile,
    bookAppointment,
    listAppointment,
    cancelAppointment,
    paymentPayFast,
    verifyPayFast,
    checkPractitionerAvailability
};
