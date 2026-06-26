"""
Security utilities for Student360Pro application.
Includes password validation, rate limiting, and security helpers.
"""

import re
import logging
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from collections import defaultdict

logger = logging.getLogger(__name__)


class PasswordValidator:
    """
    Validates password strength and requirements.
    Minimum requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    
    MIN_LENGTH = 8
    SPECIAL_CHARS = r'[!@#$%^&*(),.?":{}|<>]'
    
    @staticmethod
    def validate(password):
        """
        Validates password strength.
        Returns: (is_valid: bool, errors: list)
        """
        errors = []
        
        if not password:
            return False, ["Password is required"]
        
        if len(password) < PasswordValidator.MIN_LENGTH:
            errors.append(f"Password must be at least {PasswordValidator.MIN_LENGTH} characters long")
        
        if not re.search(r'[A-Z]', password):
            errors.append("Password must contain at least one uppercase letter")
        
        if not re.search(r'[a-z]', password):
            errors.append("Password must contain at least one lowercase letter")
        
        if not re.search(r'[0-9]', password):
            errors.append("Password must contain at least one digit")
        
        if not re.search(PasswordValidator.SPECIAL_CHARS, password):
            errors.append("Password must contain at least one special character (!@#$%^&*...)")
        
        return len(errors) == 0, errors


class RateLimiter:
    """
    Simple in-memory rate limiter for login attempts.
    Tracks failed login attempts per IP/username combination.
    """
    
    MAX_ATTEMPTS = 5
    LOCKOUT_DURATION = 15  # minutes
    ATTEMPT_WINDOW = 15    # minutes
    
    def __init__(self):
        self.attempts = defaultdict(list)
        self.locked_accounts = {}
    
    def is_locked(self, identifier):
        """Check if an identifier (IP or username) is locked out."""
        if identifier in self.locked_accounts:
            lockout_time = self.locked_accounts[identifier]
            if datetime.now() < lockout_time:
                return True
            else:
                # Lockout period expired
                del self.locked_accounts[identifier]
        return False
    
    def get_lockout_time_remaining(self, identifier):
        """Get remaining lockout time in seconds."""
        if identifier in self.locked_accounts:
            remaining = (self.locked_accounts[identifier] - datetime.now()).total_seconds()
            return max(0, remaining)
        return 0
    
    def record_attempt(self, identifier, success=False):
        """
        Record a login attempt.
        If success=True, clears the attempt history.
        """
        if success:
            self.attempts[identifier] = []
            return True
        
        # Record failed attempt
        now = datetime.now()
        self.attempts[identifier].append(now)
        
        # Remove attempts older than the window
        self.attempts[identifier] = [
            attempt for attempt in self.attempts[identifier]
            if now - attempt < timedelta(minutes=self.ATTEMPT_WINDOW)
        ]
        
        # Check if locked out
        if len(self.attempts[identifier]) >= self.MAX_ATTEMPTS:
            lockout_end = now + timedelta(minutes=self.LOCKOUT_DURATION)
            self.locked_accounts[identifier] = lockout_end
            logger.warning(f"Account/IP locked out: {identifier} until {lockout_end}")
            return False
        
        return True
    
    def get_remaining_attempts(self, identifier):
        """Get number of remaining attempts before lockout."""
        return max(0, self.MAX_ATTEMPTS - len(self.attempts[identifier]))


class SecurityHeaders:
    """
    Utility to apply security headers to responses.
    """
    
    @staticmethod
    def apply_headers(response):
        """Apply security headers to a Flask response."""
        # Prevent MIME type sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        # Enable XSS protection
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # Prevent clickjacking
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        
        # Content Security Policy
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
        
        # Referrer Policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # HSTS (Strict-Transport-Security) - Uncomment in production with HTTPS
        # response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        return response


class InputValidator:
    """
    Utilities for input validation and sanitization.
    """
    
    @staticmethod
    def validate_username(username):
        """
        Validate username format.
        Allowed: alphanumeric and underscores, 3-50 characters
        """
        if not username or len(username) < 3 or len(username) > 50:
            return False, "Username must be between 3 and 50 characters"
        
        if not re.match(r'^[a-zA-Z0-9_]+$', username):
            return False, "Username can only contain letters, numbers, and underscores"
        
        return True, ""
    
    @staticmethod
    def validate_email(email):
        """Validate email format."""
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, str(email)):
            return False, "Invalid email format"
        return True, ""
    
    @staticmethod
    def sanitize_string(value):
        """Basic sanitization of string input."""
        if isinstance(value, str):
            # Remove leading/trailing whitespace
            value = value.strip()
            # Remove null bytes
            value = value.replace('\x00', '')
        return value


def log_login_attempt(username, role, success, ip_address=None, reason=""):
    """Log login attempts for security auditing."""
    status = "SUCCESS" if success else "FAILED"
    log_message = f"Login attempt - Status: {status}, Username: {username}, Role: {role}"
    
    if ip_address:
        log_message += f", IP: {ip_address}"
    
    if reason:
        log_message += f", Reason: {reason}"
    
    if success:
        logger.info(log_message)
    else:
        logger.warning(log_message)


def rate_limit_decorator(limiter, get_identifier):
    """
    Decorator for rate limiting endpoint functions.
    
    Args:
        limiter: RateLimiter instance
        get_identifier: Function that extracts identifier from request
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            identifier = get_identifier()
            
            if limiter.is_locked(identifier):
                remaining_time = limiter.get_lockout_time_remaining(identifier)
                return jsonify({
                    "success": False,
                    "message": f"Account temporarily locked. Try again in {int(remaining_time / 60)} minutes."
                }), 429
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


# Global rate limiter instance
login_rate_limiter = RateLimiter()


def get_client_ip():
    """
    Get client IP address from request.
    Handles proxies and load balancers.
    """
    if request.environ.get('HTTP_CF_CONNECTING_IP'):
        return request.environ.get('HTTP_CF_CONNECTING_IP')
    
    if request.environ.get('HTTP_X_FORWARDED_FOR'):
        return request.environ.get('HTTP_X_FORWARDED_FOR').split(',')[0]
    
    return request.remote_addr or '0.0.0.0'
