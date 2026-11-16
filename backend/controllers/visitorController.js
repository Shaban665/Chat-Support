
import mongoose from 'mongoose';

import Widget from '../models/Widget.js';
import Visitor from '../models/Visitor.js';
import getDeviceInfo from '../utils/deviceInfo.js';

import {
    isAllowedOrigin,
    isPageUrlFromOrigin,
} from '../utils/domainUtils.js';

// @desc Track a website visitor
// @route POST /api/visitors/track
// @access Public (Widget Public Key)

export const trackVisitor = async (req, res) => {
    try {
        const {
            publicKey,
            visitorId,
            parentOrigin,
            currentPage,
            referrer,
        } = req.body;

        // Validate required fields
        if (
            !publicKey ||
            typeof visitorId !== 'string' ||
            !visitorId.trim() ||
            visitorId.length > 128 ||
            !parentOrigin
        ) {
            return res.status(400).json({
                success: false,
                message: 'Public key, visitor ID and parent origin are required',
            });
        }

        // Find active widget
        const widget = await Widget.findOne({
            publicKey,
            isActive: true,
        });

        if (!widget) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or inactive widget',
            });
        }

        // Verify parent website domain
        if (!isAllowedOrigin(widget, parentOrigin)) {
            return res.status(403).json({
                success: false,
                message: 'This website domain is not allowed',
            });
        }

        // Validate current page belongs to parent origin
        if (!isPageUrlFromOrigin(currentPage, parentOrigin)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid current page URL or origin mismatch',
            });
        }

        // Validate referrer if provided
        let validReferrer = null;

        if (referrer) {
            try {
                const parsedReferrer = new URL(referrer);

                if (!['http:', 'https:'].includes(parsedReferrer.protocol)) {
                    throw new Error('Invalid referrer protocol');
                }

                validReferrer = parsedReferrer.href;
            } catch {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid referrer URL',
                });
            }
        }

        // Get browser, OS, device and IP information
        const deviceInfo = getDeviceInfo(req);

        const now = new Date();

        // Create or update visitor for this widget
        await Visitor.findOneAndUpdate(
            {
                widget: widget._id,
                visitorId: visitorId.trim(),
            },
            {
                $set: {
                    ipAddress: deviceInfo.ipAddress,
                    userAgent: deviceInfo.userAgent,
                    browser: deviceInfo.browser,
                    operatingSystem: deviceInfo.operatingSystem,
                    device: deviceInfo.device,
                    currentPage,
                    referrer: validReferrer,
                    isOnline: true,
                    lastSeen: now,
                },
                $setOnInsert: {
                    firstSeen: now,
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Visitor tracked successfully',
            visitorId: visitorId.trim(),
        });

    } catch (error) {
        console.error('Track Visitor Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to track visitor',
        });
    }
};


// @desc Get all visitors belonging to logged-in agent
// @route GET /api/visitors
// @access Private (Agent)

export const getVisitors = async (req, res) => {
    try {
        const widgets = await Widget.find({
            owner: req.user._id,
        }).select('_id');

        const widgetIds = widgets.map((widget) => widget._id);

        const visitors = await Visitor.find({
            widget: { $in: widgetIds },
        })
            .populate('widget', 'name websiteUrl')
            .sort({ lastSeen: -1 });

        return res.status(200).json({
            success: true,
            totalVisitors: visitors.length,
            visitors,
        });

    } catch (error) {
        console.error('Get Visitors Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch visitors',
        });
    }
};


// @desc Get visitor details
// @route GET /api/visitors/:id
// @access Private (Agent)

export const getVisitorById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid visitor ID',
            });
        }

        const widgets = await Widget.find({
            owner: req.user._id,
        }).select('_id');

        const widgetIds = widgets.map((widget) => widget._id);

        const visitor = await Visitor.findOne({
            _id: id,
            widget: { $in: widgetIds },
        }).populate('widget', 'name websiteUrl');

        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found',
            });
        }

        return res.status(200).json({
            success: true,
            visitor,
        });

    } catch (error) {
        console.error('Get Visitor By ID Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch visitor details',
        });
    }
};
