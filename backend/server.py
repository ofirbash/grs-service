from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

import cloudinary
import resend

# Load env
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Cloudinary configuration
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# Resend email configuration
resend.api_key = os.getenv("RESEND_API_KEY", "")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI(title="Bashari Lab Logistics ERP")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Import route modules
from routes.auth_routes import router as auth_router
from routes.branches import router as branches_router
from routes.clients import router as clients_router
from routes.jobs import router as jobs_router
from routes.stones import router as stones_router
from routes.shipments import router as shipments_router
from routes.notifications import router as notifications_router
from routes.settings import router as settings_router
from routes.cloudinary_routes import router as cloudinary_router
from routes.pdf import router as pdf_router
from routes.pricing_routes import router as pricing_router
from routes.users import router as users_router
from routes.dashboard import router as dashboard_router
from routes.payments import router as payments_router
from routes.manual_payments import router as manual_payments_router
from routes.addresses import router as addresses_router
from routes.documents import router as documents_router

# Include all route modules in the api_router
# Order matters: stones group cert scan must be before stones/{stone_id} routes
api_router.include_router(auth_router)
api_router.include_router(branches_router)
api_router.include_router(clients_router)
api_router.include_router(jobs_router)
api_router.include_router(stones_router)
api_router.include_router(shipments_router)
api_router.include_router(notifications_router)
api_router.include_router(settings_router)
api_router.include_router(cloudinary_router)
api_router.include_router(pdf_router)
api_router.include_router(pricing_router)
api_router.include_router(users_router)
api_router.include_router(dashboard_router)
api_router.include_router(payments_router)
api_router.include_router(manual_payments_router)
api_router.include_router(addresses_router)
api_router.include_router(documents_router)


# Health check endpoints
@api_router.get("/")
async def root():
    return {"message": "Bashari Lab Logistics ERP API", "version": "2.0.0"}


@api_router.get("/health")
async def health_check():
    from datetime import datetime
    return {"status": "healthy", "timestamp": datetime.utcnow()}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import database client for shutdown
from database import client as db_client


@app.on_event("shutdown")
async def shutdown_db_client():
    db_client.close()
