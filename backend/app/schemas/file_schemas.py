from pydantic import BaseModel


class FileDTO(BaseModel):
    id: str
    name: str
    content_type: str
    size: int
    download_url: str
