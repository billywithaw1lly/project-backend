import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js" 
import { ApiResponse } from "../utils/ApiResponse.js"

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
const logout = asyncHandler (async (req, res) => {
    //remove cookies
    //reset access token and refresh token

    
}) 
export {
    registerUser,
    loginUser
}