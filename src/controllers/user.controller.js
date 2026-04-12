import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js" 
import { ApiResponse } from "../utils/ApiResponse.js"
import  verify from "jsonwebtoken"

//writing a controller for registering user
const registerUser = asyncHandler( async (req, res) => {
    const {username, email, fullName, password, } = req.body

    //validation
    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(
            400,
            "All fields are required"
        )
    }

    //checking if user already exist form user model
    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if(existedUser){
        throw new ApiError(
            409,
            "User already exists with the same username or email"
        )
    }

    //check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;
    if(!avatarLocalPath){
        throw new ApiError(
            400,
            "Avatar Image Required"
        )
    }

    //uploading to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    let coverImage = null;
    if(coverImageLocalPath){
        coverImage = await uploadOnCloudinary(coverImageLocalPath);
    }
    if(!avatar){
        throw new ApiError(
            400,
            "avatar failed to upload, try again"
        )
    }
    if(!coverImage){
        throw new ApiError(
            400,
            "cover image failed to upload please try again"
        )
    }

    //creating user
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || '',
        email,
        password,
        username: username.toLowerCase(),
    })


    //removing somefields from user reference 
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(
            500,
            "something went wrong while creating the user"
        )
    }

    return res
            .status(201)
            .json(
                new ApiResponse(
                    200,
                    createdUser,
                    "User registered Successfully"
                )
            )
})

//writing a controller for login
const loginUser = asyncHandler (async (req, res) => {
    const {email, username, password} = req.body;
    if(!(username || email)){
        throw new ApiError(
            400,
            "Username or Email is required "
        )
    }
    const user = await User.findOne({
        $or: [{email}, {username}]
    })
    if(!user){
        throw new ApiError(
            404,
            "User not found"
        )
    }
    
    //checking password if user exists
    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid){
        throw new ApiError(
            401,
            "Invalid user credentials"
        )
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)
    const loggedInUser = await User.findById(user._id).select('-password -refreshToken')
    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser, accessToken, refreshToken
                    },
                    "User logged in successfully"
                )
            )

})

//writing a controller for generating access and refresh tokens
const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({
            validateBeforeSave: false,
        });
        return {
            accessToken,
            refreshToken,
        }
    } catch (error) {
        throw new ApiError(
            500,
            "something went wrong while generating tokens"
        )
    }
}

//writing a controller for logging out user
const logoutUser = asyncHandler (async (req, res) => {
    //remove cookies
    //reset access token and refresh token
    await User.findByIdAndUpdate(
        req.user._id,{
            $set: {
                refreshToken: undefined,
            }
        },
        {
            new: true,
        }
    )
    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(
            200,
            {},
            "user logged out"
        ))
})

//generating refresh token
const refreshAccessToken = asyncHandler (async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshAccessToken || req.body.refreshAccessToken

    if(!incomingRefreshToken){
        throw new ApiError(
            401,
            "unauthorized request"
        )
    }

    try {
        const decodedToken = await jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(
                401,
                "invalid refresh token"
            )
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(
                401,
                "refresh token is invalid"
            )
        }
    
        const options = {
            httpOnly: true,
            secure: true,
        }
    
        const {accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id);
    
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                    accessToken,
                    refreshToken: newRefreshToken,
                    },
                    "Access token refreshed"
                ));
    } catch (error) {
        throw new ApiError(
            401,
            error.message || "invalid refresh token"
        )
    }
})

//changing current password
const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(
            400,
            "invalid password"
        )
    }

    user.password = newPassword;
    await user.save({
        validateBeforeSave: false
    })

    return res
            .status(200)
            .json(new ApiError(
                200,
                {},
                "Password changed successfully"
            ))
})

//fetching user
const getCurrentUser = asyncHandler (async(req, res) => {
    return res // something feels wrong here
        .status(200)
        .json(
            new ApiResponse(200, user, "current user fetched successfully")
        );
})

//updating account details but not media
const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body
    if(!fullName || !email){
        throw new ApiError(
            400,
            "All fiels are required"
        )
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName,
                email,
            }
        },
        {
            new: true
        }
    ).select("-password -refreshToken");

    return res
            .status(200)
            .json(new ApiResponse(
                200,
                user,
                "Account details updated successfully"
            ))
})

//updating media
const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.files?.path;
    if(!avatarLocalPath){
        throw new ApiError(
            400,
            "Avatar file is missing",
        )
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new ApiError(
            400,
            "Error while uploading while updating Avatar"
        )
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url,
            }
        },
        {
            new:true,
        }
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json(new ApiResponse(200, user, "avatar image successfully"));
})

//updating media
const updateCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.files?.path;
    if (!coverImageLocalPath) {
        throw new ApiError(400, "cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading while updating cover image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        {
            new: true,
        }
    ).select("-password -refreshToken");

    return res
            .status(200)
            .json(new ApiResponse(
                200,
                user,
                "updated cover image successfully"
            ))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateCoverImage,
}