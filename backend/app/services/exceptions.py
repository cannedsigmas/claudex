from enum import Enum

from app.models.types import ExceptionDetails


class ErrorCode(str, Enum):
    UNKNOWN_ERROR = "UNKNOWN_ERROR"

    CHAT_NOT_FOUND = "CHAT_NOT_FOUND"
    CHAT_ACCESS_DENIED = "CHAT_ACCESS_DENIED"
    CHAT_CREATE_FAILED = "CHAT_CREATE_FAILED"
    CHAT_UPDATE_FAILED = "CHAT_UPDATE_FAILED"
    CHAT_DELETE_FAILED = "CHAT_DELETE_FAILED"
    CHAT_DAILY_LIMIT_EXCEEDED = "CHAT_DAILY_LIMIT_EXCEEDED"

    MESSAGE_NOT_FOUND = "MESSAGE_NOT_FOUND"
    MESSAGE_CREATE_FAILED = "MESSAGE_CREATE_FAILED"
    MESSAGE_UPDATE_FAILED = "MESSAGE_UPDATE_FAILED"

    USER_NOT_FOUND = "USER_NOT_FOUND"
    USER_ALREADY_EXISTS = "USER_ALREADY_EXISTS"
    USER_INVALID_CREDENTIALS = "USER_INVALID_CREDENTIALS"
    USER_NOT_VERIFIED = "USER_NOT_VERIFIED"
    USER_SETTINGS_NOT_FOUND = "USER_SETTINGS_NOT_FOUND"

    AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"

    SANDBOX_NOT_FOUND = "SANDBOX_NOT_FOUND"
    SANDBOX_ACCESS_DENIED = "SANDBOX_ACCESS_DENIED"
    SANDBOX_CREATE_FAILED = "SANDBOX_CREATE_FAILED"
    SANDBOX_CONNECTION_FAILED = "SANDBOX_CONNECTION_FAILED"
    SANDBOX_OPERATION_FAILED = "SANDBOX_OPERATION_FAILED"

    STORAGE_FILE_NOT_FOUND = "STORAGE_FILE_NOT_FOUND"
    STORAGE_UPLOAD_FAILED = "STORAGE_UPLOAD_FAILED"
    STORAGE_DELETE_FAILED = "STORAGE_DELETE_FAILED"
    STORAGE_FILE_TOO_LARGE = "STORAGE_FILE_TOO_LARGE"
    STORAGE_INVALID_FILE_TYPE = "STORAGE_INVALID_FILE_TYPE"

    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    AI_SERVICE_TIMEOUT = "AI_SERVICE_TIMEOUT"
    AI_SERVICE_UNAVAILABLE = "AI_SERVICE_UNAVAILABLE"
    AI_INVALID_MODEL = "AI_INVALID_MODEL"

    API_KEY_MISSING = "API_KEY_MISSING"
    API_KEY_INVALID = "API_KEY_INVALID"

    SCHEDULER_TASK_NOT_FOUND = "SCHEDULER_TASK_NOT_FOUND"
    SCHEDULER_TASK_CREATE_FAILED = "SCHEDULER_TASK_CREATE_FAILED"
    SCHEDULER_TASK_UPDATE_FAILED = "SCHEDULER_TASK_UPDATE_FAILED"

    SKILL_NOT_FOUND = "SKILL_NOT_FOUND"
    SKILL_INVALID = "SKILL_INVALID"
    SKILL_UPLOAD_FAILED = "SKILL_UPLOAD_FAILED"

    COMMAND_NOT_FOUND = "COMMAND_NOT_FOUND"
    COMMAND_INVALID = "COMMAND_INVALID"
    COMMAND_UPLOAD_FAILED = "COMMAND_UPLOAD_FAILED"

    AGENT_NOT_FOUND = "AGENT_NOT_FOUND"
    AGENT_INVALID = "AGENT_INVALID"
    AGENT_UPLOAD_FAILED = "AGENT_UPLOAD_FAILED"

    MARKETPLACE_FETCH_FAILED = "MARKETPLACE_FETCH_FAILED"
    MARKETPLACE_PLUGIN_NOT_FOUND = "MARKETPLACE_PLUGIN_NOT_FOUND"
    MARKETPLACE_INSTALL_FAILED = "MARKETPLACE_INSTALL_FAILED"

    VALIDATION_ERROR = "VALIDATION_ERROR"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"


class ServiceException(Exception):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
        details: ExceptionDetails | None = None,
        status_code: int = 500,
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details: ExceptionDetails = details or {}
        self.status_code = status_code

    def to_dict(self) -> dict[str, str | ExceptionDetails]:
        return {
            "error_code": self.error_code.value,
            "message": self.message,
            "details": self.details,
        }


class ChatException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.CHAT_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class MessageException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.MESSAGE_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class UserException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.USER_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class SandboxException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.SANDBOX_OPERATION_FAILED,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class StorageException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.STORAGE_FILE_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class ClaudeAgentException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.AI_SERVICE_ERROR,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class SchedulerException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.SCHEDULER_TASK_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class SkillException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.SKILL_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class CommandException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.COMMAND_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class AgentException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.AGENT_NOT_FOUND,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class APIKeyValidationException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.API_KEY_MISSING,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)


class ExternalServiceException(ServiceException):
    def __init__(
        self,
        message: str,
        service_name: str,
        error_code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_ERROR,
        details: ExceptionDetails | None = None,
        status_code: int = 503,
    ):
        details = details or {}
        details["service_name"] = service_name
        super().__init__(message, error_code, details, status_code)


class AuthException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.AUTH_INVALID_TOKEN,
        details: ExceptionDetails | None = None,
        status_code: int = 401,
    ):
        super().__init__(message, error_code, details, status_code)


class MarketplaceException(ServiceException):
    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.MARKETPLACE_FETCH_FAILED,
        details: ExceptionDetails | None = None,
        status_code: int = 400,
    ):
        super().__init__(message, error_code, details, status_code)
